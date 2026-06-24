package handles

import (
	"fmt"
	"go-app/model"
	"net/http"
	"strings"

	"github.com/eskeon/scale/scale"
	"github.com/eskeon/scale/scale/logger"
)

type body struct {
	Topic string `json:"topic" binding:"required"`
}

type transcriptBody struct {
	Transcript string `json:"transcript" binding:"required"`
}

func CreateInterview(r *scale.Request) scale.Response {
	parsedBody := scale.Parse[body](r)
	repo := scale.WR[model.Interview](r)

	created := repo.Create(&model.Interview{
		Topic: parsedBody.Topic,
	})

	logger.Infof("Interview created successfully: id=%d topic=%s", created.ID, created.Topic)

	return scale.JsonResponse(map[string]any{
		"message": "interview has assigned successfully",
		"id":      created.ID,
		"topic":   created.Topic,
		"status":  http.StatusCreated,
	})
}

func ListInterviews(r *scale.Request) scale.Response {
	pr := scale.WR[model.Interview](r)
	rows := pr.Objects().Descending("created_at").All()

	return scale.MapResponse(rows, func(i *model.Interview) map[string]any {
		return map[string]any{
			"id":     i.ID,
			"topic":  i.Topic,
			"status": i.Status,
			"score":  i.Score,
		}
	})
}

func GetInterview(r *scale.Request) scale.Response {
	return ListInterviews(r)
}

func CompleteInterview(r *scale.Request) scale.Response {
	id := r.Param("id").Int64()
	pr := scale.WR[model.Interview](r)

	interview := pr.Objects().
		Where("id = ?", id).
		Preload("Responses").
		First()

	if interview.Status == "completed" {
		panic(scale.BadRequestError("interview already completed"))
	}

	finalScore := computeFinalScore(interview.Responses)

	updated := pr.Update(id, &model.Interview{
		Status: "completed",
		Score:  finalScore,
	}, "Status", "Score")

	interview.Status = updated.Status
	interview.Score = updated.Score

	return scale.JsonResponse(map[string]any{
		"id":        interview.ID,
		"topic":     interview.Topic,
		"status":    interview.Status,
		"score":     interview.Score,
		"responses": interview.Responses,
	})
}

func computeFinalScore(responses []model.Response) string {
	if len(responses) == 0 {
		return "0.00"
	}

	total := 0
	for _, response := range responses {
		total += response.Score
	}

	average := float64(total) / float64(len(responses))
	return fmt.Sprintf("%.2f", average)
}

func GenerateInterviewQuestion(r *scale.Request) scale.Response {

	if r.Method == http.MethodPost {

	}
	interviewID := r.Param("id").Int64()
	fmt.Println("GenerateInterviewQuestion route hit, id:", interviewID)

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)

	interview := interviewRepo.Objects().Where("id = ?", interviewID).First()

	// logger.Infof("checking: ",interview)
	if interview.Status == "completed" {
		panic(scale.BadRequestError("interview already completed"))
	}

	responses := responseRepo.Objects().
		Where("interview_id = ?", interviewID).
		Ascending("question_num", "created_at").
		All()

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

	return scale.JsonResponseCreated(map[string]any{
		"question":        created.Question,
		"question_number": created.QuestionNum,
		"difficulty":      nextQuestion.Difficulty,
	})
}

func SubmitInterviewResponse(r *scale.Request) scale.Response {
	interviewID := r.Param("id").Int64()
	payload := scale.Parse[transcriptBody](r)
	transcript := strings.TrimSpace(payload.Transcript)
	if transcript == "" {
		panic(scale.BadRequestError("transcript is required"))
	}

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)
	evaluationRepo := scale.WR[model.Evaluation](r)

	interview := interviewRepo.Objects().Where("id = ?", interviewID).First()
	if interview.Status == "completed" {
		panic(scale.BadRequestError("interview already completed"))
	}

	lastResponse := responseRepo.Objects().
		Where("interview_id = ?", interviewID).
		Descending("question_num", "created_at").
		FirstOrNil()
	if lastResponse == nil {
		panic(scale.BadRequestError("no interview question found"))
	}

	if strings.TrimSpace(lastResponse.Answer) != "" {
		panic(scale.BadRequestError("latest question already has a response"))
	}

	evaluation, err := evaluateInterviewAnswer(interview, lastResponse, transcript)
	if err != nil {
		panic(scale.InternalServerError("failed to evaluate interview response", err))
	}

	score := averageEvaluationScore(evaluation)

	responseRepo.Update(int64(lastResponse.ID), &model.Response{
		Answer:   transcript,
		Score:    score,
		Feedback: evaluation.Feedback,
	}, "Answer", "Score", "Feedback")

	evaluationRecord := evaluationRepo.Create(&model.Evaluation{
		ResponseID:      uint(lastResponse.ID),
		Correctness:     evaluation.Correctness,
		Clarity:         evaluation.Clarity,
		Depth:           evaluation.Depth,
		Confidence:      evaluation.Confidence,
		AIFeedback:      evaluation.Feedback,
		SuggestedAnswer: evaluation.SuggestedAnswer,
	})

	return scale.JsonResponse(map[string]any{
		"response_id":      lastResponse.ID,
		"question":         lastResponse.Question,
		"transcript":       transcript,
		"score":            score,
		"correctness":      evaluationRecord.Correctness,
		"clarity":          evaluationRecord.Clarity,
		"depth":            evaluationRecord.Depth,
		"confidence":       evaluationRecord.Confidence,
		"feedback":         evaluationRecord.AIFeedback,
		"suggested_answer": evaluationRecord.SuggestedAnswer,
	})
}

func GenerateInterviewFollowUp(r *scale.Request) scale.Response {
	interviewID := r.Param("id").Int64()
	logger.Infof("Generating follow-up question for interview: %d", interviewID)
	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)
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
		panic(scale.BadRequestError("no interview responses available for follow-up"))
	}

	latest := responses[len(responses)-1]
	if strings.TrimSpace(latest.Answer) == "" {
		panic(scale.BadRequestError("latest question must be answered before follow-up"))
	}

	followUp, err := generateFollowUp(interview, latest, responses)
	if err != nil {
		panic(scale.InternalServerError("failed to generate follow-up question", err))
	}

	questionNumber := latest.QuestionNum + 1
	parentID := uint(latest.ID)

	created := responseRepo.Create(&model.Response{
		InterviewID: uint(interviewID),
		QuestionNum: questionNumber,
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

	return scale.JsonResponseCreated(map[string]any{
		"followup_question":  created.Question,
		"question_number":    created.QuestionNum,
		"parent_response_id": parentID,
		"reasoning":          followUp.Reasoning,
		"concept_tested":     followUp.ConceptTested,
		"difficulty":         followUp.Difficulty,
	})
}

func GetInterviewResponses(r *scale.Request) scale.Response {
	interviewID := r.Param("id").Int64()
	responseRepo := scale.WR[model.Response](r)

	responses := responseRepo.Objects().
		Where("interview_id = ?", interviewID).
		Preload("Evaluation").
		Preload("FollowUpContext").
		Ascending("question_num", "created_at").
		All()

	type responseView struct {
		ID              int64                  `json:"id"`
		QuestionNumber  int                    `json:"question_number"`
		Question        string                 `json:"question"`
		Answer          string                 `json:"answer"`
		Score           int                    `json:"score"`
		IsFollowUp      bool                   `json:"is_follow_up"`
		ParentID        *uint                  `json:"parent_id,omitempty"`
		Evaluation      *model.Evaluation      `json:"evaluation,omitempty"`
		FollowUpContext *model.FollowUpContext `json:"follow_up_context,omitempty"`
		FollowUps       []responseView         `json:"follow_ups"`
	}

	viewByID := make(map[int64]*responseView, len(responses))
	roots := make([]responseView, 0)

	for _, response := range responses {
		view := &responseView{
			ID:              response.ID,
			QuestionNumber:  response.QuestionNum,
			Question:        response.Question,
			Answer:          response.Answer,
			Score:           response.Score,
			IsFollowUp:      response.IsFollowUp,
			ParentID:        response.ParentID,
			Evaluation:      response.Evaluation,
			FollowUpContext: response.FollowUpContext,
			FollowUps:       []responseView{},
		}
		viewByID[response.ID] = view
	}

	for _, response := range responses {
		view := viewByID[response.ID]
		if response.ParentID != nil {
			if parent, ok := viewByID[int64(*response.ParentID)]; ok {
				parent.FollowUps = append(parent.FollowUps, *view)
				continue
			}
		}
		roots = append(roots, *view)
	}

	return scale.JsonResponse(map[string]any{
		"responses": roots,
		"count":     len(responses),
	})
}

func GetInterviewEvaluation(r *scale.Request) scale.Response {
	id := r.Param("id").Int64()

	repo := scale.WR[model.Interview](r)

	interview := repo.Objects().
		Where("id = ?", id).
		Preload("Responses.Evaluation").
		First()

	if interview.ID == 0 {
		panic(scale.NotFoundError("interview not found"))
	}

	if interview.Status != "completed" {
		panic(scale.BadRequestError("interview not completed yet"))
	}

	var totalCorrectness, totalClarity, totalDepth, totalConfidence int
	var count int

	for _, res := range interview.Responses {
		if res.Evaluation != nil {
			ev := res.Evaluation
			totalCorrectness += ev.Correctness
			totalClarity += ev.Clarity
			totalDepth += ev.Depth
			totalConfidence += ev.Confidence
			count++
		}
	}

	if count == 0 {
		return scale.JsonResponse(map[string]any{
			"message": "no evaluations found",
		})
	}

	avg := func(total int) float64 {
		return float64(total) / float64(count)
	}

	return scale.JsonResponse(map[string]any{
		"interview_id": interview.ID,
		"topic":        interview.Topic,
		"status":       interview.Status,
		"final_score":  interview.Score,

		"metrics": map[string]any{
			"correctness": avg(totalCorrectness),
			"clarity":     avg(totalClarity),
			"depth":       avg(totalDepth),
			"confidence":  avg(totalConfidence),
		},

		"total_questions": len(interview.Responses),
	})
}

func GetResponseEvaluation(r *scale.Request) scale.Response {
	id := r.Param("id").Int64()

	repo := scale.WR[model.Response](r)

	response := repo.Objects().
		Where("id = ?", id).
		Preload("Evaluation").
		Preload("FollowUpContext").
		First()

	if response.ID == 0 {
		panic(scale.NotFoundError("response not found"))
	}

	if response.Evaluation == nil {
		return scale.JsonResponse(map[string]any{
			"message": "evaluation not available yet",
		})
	}

	ev := response.Evaluation

	return scale.JsonResponse(map[string]any{
		"response_id": response.ID,
		"question":    response.Question,
		"answer":      response.Answer,
		"score":       response.Score,

		"evaluation": map[string]any{
			"correctness": ev.Correctness,
			"clarity":     ev.Clarity,
			"depth":       ev.Depth,
			"confidence":  ev.Confidence,
			"feedback":    ev.AIFeedback,
			"suggested":   ev.SuggestedAnswer,
		},

		"follow_up_context": response.FollowUpContext,
	})
}
