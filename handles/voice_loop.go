package handles

import (
	"fmt"
	"go-app/model"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/eskeon/scale/scale"
	"github.com/eskeon/scale/scale/logger"
)

const (
	maxVoiceUploadBytes = 10 << 20
	maxMainQuestions    = 5
	maxFollowUps        = 3
)

type aiQuestionRequest struct {
	InterviewID int64 `json:"interview_id"`
}

func readInterviewID(r *scale.Request) int64 {
	if r.Request != nil {
		queryID := strings.TrimSpace(r.Request.URL.Query().Get("interview_id"))
		if queryID != "" {
			if parsed, err := strconv.ParseInt(queryID, 10, 64); err == nil {
				return parsed
			}
		}

		if r.Request.Method == http.MethodGet {
			return 0
		}
	}

	payload := scale.Parse[aiQuestionRequest](r)
	return payload.InterviewID
}

func GenerateAIVoiceQuestion(r *scale.Request) scale.Response {
	interviewID := readInterviewID(r)
	if interviewID == 0 {
		panic(scale.BadRequestError("interview_id is required"))
	}

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)

	interview := interviewRepo.Objects().Where("id = ?", interviewID).First()
	if interview.Status == "completed" {
		return scale.JsonResponse(map[string]any{
			"text":            "This interview is already complete.",
			"question_id":     0,
			"follow_up":       false,
			"follow_up_count": 0,
			"completed":       true,
		})
	}

	responses := responseRepo.Objects().
		Where("interview_id = ?", interviewID).
		Ascending("question_num", "created_at").
		All()

	mainQuestionCount := countMainQuestions(responses)
	if mainQuestionCount >= maxMainQuestions {
		return finalizeInterviewTurn(interviewRepo, interview, responses)
	}

	nextQuestion, err := generateNextQuestion(interview, responses)
	if err != nil {
		panic(scale.InternalServerError("failed to generate interview question", err))
	}

	questionNumber := 1
	if len(responses) > 0 {
		questionNumber = responses[len(responses)-1].QuestionNum + 1
	}

	created := responseRepo.Create(&model.Response{
		InterviewID: uint(interviewID),
		QuestionNum: questionNumber,
		Question:    nextQuestion.Question,
		IsFollowUp:  false,
	})

	return scale.JsonResponse(map[string]any{
		"text":            created.Question,
		"question_id":     created.ID,
		"follow_up":       false,
		"follow_up_count": 0,
		"completed":       false,
	})
}

func SubmitAIVoiceAnswer(r *scale.Request) scale.Response {
	req := r.Request
	req.Body = http.MaxBytesReader(r.ResponseWriter, req.Body, maxVoiceUploadBytes)
	if err := req.ParseMultipartForm(maxVoiceUploadBytes); err != nil {
		panic(scale.BadRequestError("invalid multipart form", err))
	}

	interviewID, err := strconv.ParseInt(strings.TrimSpace(req.FormValue("interview_id")), 10, 64)
	if err != nil || interviewID == 0 {
		panic(scale.BadRequestError("interview_id is required"))
	}

	questionID, _ := strconv.ParseInt(strings.TrimSpace(req.FormValue("question_id")), 10, 64)

	file, header, err := req.FormFile("audio")
	if err != nil {
		panic(scale.BadRequestError("audio file is required", err))
	}
	defer file.Close()

	audioBytes, err := io.ReadAll(file)
	if err != nil {
		panic(scale.BadRequestError("failed to read audio upload", err))
	}

	transcript, err := transcribeAudio(
		audioUploadFilename(header.Filename),
		audioBytes,
		header.Header.Get("Content-Type"),
	)
	if err != nil {
		logger.Errorf("failed to transcribe audio for interview %d question %d: %v", interviewID, questionID, err)
		return scale.JsonResponseWithCode(http.StatusServiceUnavailable, map[string]any{
			"message": "speech to text unavailable",
			"error":   err.Error(),
		})
	}

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)
	evaluationRepo := scale.WR[model.Evaluation](r)
	followUpRepo := scale.WR[model.FollowUpContext](r)

	interview := interviewRepo.Objects().Where("id = ?", interviewID).First()
	if interview.Status == "completed" {
		panic(scale.BadRequestError("interview already completed"))
	}

	responses := responseRepo.Objects().
		Where("interview_id = ?", interviewID).
		Ascending("question_num", "created_at").
		All()
	if len(responses) == 0 {
		panic(scale.BadRequestError("no interview question found"))
	}

	current := findPendingResponse(responses, questionID)
	if current == nil {
		panic(scale.BadRequestError("no pending question found for this answer"))
	}

	evaluation, err := evaluateInterviewAnswer(interview, current, transcript)
	if err != nil {
		panic(scale.InternalServerError("failed to evaluate interview response", err))
	}

	score := averageEvaluationScore(evaluation)

	responseRepo.Update(int64(current.ID), &model.Response{
		Answer:   transcript,
		Score:    score,
		Feedback: evaluation.Feedback,
	}, "Answer", "Score", "Feedback")

	evaluationRepo.Create(&model.Evaluation{
		ResponseID:      uint(current.ID),
		Correctness:     evaluation.Correctness,
		Clarity:         evaluation.Clarity,
		Depth:           evaluation.Depth,
		Confidence:      evaluation.Confidence,
		AIFeedback:      evaluation.Feedback,
		SuggestedAnswer: evaluation.SuggestedAnswer,
	})

	responses = responseRepo.Objects().
		Where("interview_id = ?", interviewID).
		Ascending("question_num", "created_at").
		All()

	root := resolveRootResponse(responses, current)
	followUpCount := countFollowUpsForRoot(responses, root.ID)
	shouldAskFollowUp := score >= 3 && score <= 7 && followUpCount < maxFollowUps

	if shouldAskFollowUp {
		followUp, err := generateFollowUp(interview, current, responses)
		if err != nil {
			panic(scale.InternalServerError("failed to generate follow-up question", err))
		}

		parentID := uint(current.ID)
		created := responseRepo.Create(&model.Response{
			InterviewID: uint(interviewID),
			QuestionNum: current.QuestionNum + 1,
			Question:    followUp.Question,
			IsFollowUp:  true,
			ParentID:    &parentID,
		})

		followUpRepo.Create(&model.FollowUpContext{
			ResponseID:    uint(created.ID),
			Reasoning:     followUp.Reasoning,
			Difficulty:    followUp.Difficulty,
			ConceptTested: followUp.ConceptTested,
		})

		return scale.JsonResponse(map[string]any{
			"text":            created.Question,
			"question_id":     created.ID,
			"score":           score,
			"follow_up":       true,
			"follow_up_count": followUpCount + 1,
			"transcript":      transcript,
			"completed":       false,
		})
	}

	mainQuestionCount := countMainQuestions(responses)
	if !current.IsFollowUp && mainQuestionCount >= maxMainQuestions {
		return finalizeInterviewTurn(interviewRepo, interview, responses, withTurnMetadata(score, transcript))
	}

	if current.IsFollowUp && mainQuestionCount >= maxMainQuestions && root != nil && root.QuestionNum >= maxMainQuestions {
		return finalizeInterviewTurn(interviewRepo, interview, responses, withTurnMetadata(score, transcript))
	}

	nextQuestion, err := generateNextQuestion(interview, responses)
	if err != nil {
		panic(scale.InternalServerError("failed to generate next interview question", err))
	}

	nextQuestionNum := responses[len(responses)-1].QuestionNum + 1
	created := responseRepo.Create(&model.Response{
		InterviewID: uint(interviewID),
		QuestionNum: nextQuestionNum,
		Question:    nextQuestion.Question,
		IsFollowUp:  false,
	})

	return scale.JsonResponse(map[string]any{
		"text":            created.Question,
		"question_id":     created.ID,
		"score":           score,
		"follow_up":       false,
		"follow_up_count": 0,
		"transcript":      transcript,
		"completed":       false,
	})
}

type turnMetadata struct {
	score      int
	transcript string
}

func withTurnMetadata(score int, transcript string) turnMetadata {
	return turnMetadata{score: score, transcript: transcript}
}

func finalizeInterviewTurn(interviewRepo *scale.DAO[model.Interview], interview *model.Interview, responses []*model.Response, meta ...turnMetadata) scale.Response {
	if interview.Status != "completed" {
		finalScore := computeFinalScore(derefResponses(responses))
		updated := interviewRepo.Update(int64(interview.ID), &model.Interview{
			Status: "completed",
			Score:  finalScore,
		}, "Status", "Score")
		interview.Status = updated.Status
		interview.Score = updated.Score
	}

	message := "Interview complete. Thank you for your responses."

	payload := map[string]any{
		"text":            message,
		"question_id":     0,
		"follow_up":       false,
		"follow_up_count": 0,
		"completed":       true,
		"final_score":     interview.Score,
	}

	if len(meta) > 0 {
		payload["score"] = meta[0].score
		payload["transcript"] = meta[0].transcript
	}

	return scale.JsonResponse(payload)
}

func derefResponses(items []*model.Response) []model.Response {
	out := make([]model.Response, 0, len(items))
	for _, item := range items {
		if item != nil {
			out = append(out, *item)
		}
	}
	return out
}

func findPendingResponse(responses []*model.Response, questionID int64) *model.Response {
	for i := len(responses) - 1; i >= 0; i-- {
		response := responses[i]
		if response == nil || strings.TrimSpace(response.Answer) != "" {
			continue
		}
		if questionID == 0 || response.ID == questionID {
			return response
		}
	}

	return nil
}

func resolveRootResponse(responses []*model.Response, current *model.Response) *model.Response {
	if current == nil {
		return nil
	}
	if current.ParentID == nil {
		return current
	}

	byID := make(map[uint]*model.Response, len(responses))
	for _, response := range responses {
		if response != nil {
			byID[uint(response.ID)] = response
		}
	}

	node := current
	for node != nil && node.ParentID != nil {
		parent := byID[*node.ParentID]
		if parent == nil {
			break
		}
		node = parent
	}

	return node
}

func countFollowUpsForRoot(responses []*model.Response, rootID int64) int {
	if rootID == 0 {
		return 0
	}

	count := 0
	for _, response := range responses {
		if response == nil || !response.IsFollowUp {
			continue
		}
		if resolved := resolveRootResponse(responses, response); resolved != nil && resolved.ID == rootID {
			count++
		}
	}

	return count
}

func countMainQuestions(responses []*model.Response) int {
	count := 0
	for _, response := range responses {
		if response != nil && !response.IsFollowUp {
			count++
		}
	}
	return count
}

func audioUploadFilename(name string) string {
	base := strings.TrimSpace(name)
	if base == "" {
		return "answer.webm"
	}

	ext := filepath.Ext(base)
	if ext == "" {
		return fmt.Sprintf("%s.webm", base)
	}

	return base
}
