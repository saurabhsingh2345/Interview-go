package handles

import (
	"encoding/json"
	"go-app/model"
	"strings"

	"github.com/eskeon/scale/scale"
)

type codeSubmissionBody struct {
	ResponseID       int64  `json:"response_id"`
	Language         string `json:"language"`
	Code             string `json:"code"`
	TimeTakenSeconds int    `json:"time_taken_seconds"`
}

func SubmitCode(r *scale.Request) scale.Response {
	interviewID := r.Param("id").Int64()
	payload := scale.Parse[codeSubmissionBody](r)

	if payload.ResponseID == 0 {
		panic(scale.BadRequestError("response_id is required"))
	}
	if strings.TrimSpace(payload.Code) == "" {
		panic(scale.BadRequestError("code is required"))
	}

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)
	evaluationRepo := scale.WR[model.Evaluation](r)

	interview := interviewRepo.Objects().Where("id = ?", interviewID).First()
	if interview.ID == 0 {
		panic(scale.NotFoundError("interview not found"))
	}
	if interview.Status == "completed" {
		panic(scale.BadRequestError("interview already completed"))
	}

	response := responseRepo.Objects().Where("id = ?", payload.ResponseID).FirstOrNil()
	if response == nil {
		panic(scale.NotFoundError("response not found"))
	}
	if int64(response.InterviewID) != interviewID {
		panic(scale.BadRequestError("response does not belong to this interview"))
	}

	lang := strings.TrimSpace(payload.Language)
	if lang == "" {
		lang = "unknown"
	}
	code := strings.TrimSpace(payload.Code)

	evaluation, err := evaluateCode(response.Question, lang, code)
	if err != nil {
		panic(scale.InternalServerError("code evaluation failed", err))
	}

	// Store the submission: prefix with language tag for readability
	codeAnswer := "[" + lang + "]\n" + code
	responseRepo.Update(payload.ResponseID, &model.Response{
		Answer: codeAnswer,
		Score:  evaluation.Correctness,
	}, "Answer", "Score")

	evalRecord := evaluationRepo.Create(&model.Evaluation{
		ResponseID:           uint(payload.ResponseID),
		Correctness:          evaluation.Correctness,
		Depth:                evaluation.CodeQuality,
		AIFeedback:           evaluation.BugDescription,
		SuggestedAnswer:      evaluation.FollowUpQuestion,
		TimeComplexity:       evaluation.TimeComplexity,
		SpaceComplexity:      evaluation.SpaceComplexity,
		HasBugs:              evaluation.HasBugs,
		BugDescription:       evaluation.BugDescription,
		OptimizationPossible: evaluation.OptimizationPossible,
	})

	// Advance phase
	advancement := computePhaseAdvancement(interview, evaluation.Correctness)
	interviewRepo.Update(interviewID, &model.Interview{
		CurrentPhase:       advancement.NewPhase,
		PhaseQuestionCount: advancement.NewPhaseCount,
		SkillEstimate:      advancement.NewSkillEstimate,
	}, "CurrentPhase", "PhaseQuestionCount", "SkillEstimate")
	interview.CurrentPhase = advancement.NewPhase

	if advancement.ShouldComplete {
		allResponses := responseRepo.Objects().Where("interview_id = ?", interviewID).All()
		interviewRepo.Update(interviewID, &model.Interview{
			Status: "completed",
			Score:  computeFinalScore(derefResponses(allResponses)),
		}, "Status", "Score")
	}

	return scale.JsonResponse(map[string]any{
		"response_id":           payload.ResponseID,
		"evaluation_id":         evalRecord.ID,
		"correctness":           evaluation.Correctness,
		"time_complexity":       evaluation.TimeComplexity,
		"space_complexity":      evaluation.SpaceComplexity,
		"code_quality":          evaluation.CodeQuality,
		"has_bugs":              evaluation.HasBugs,
		"bug_description":       evaluation.BugDescription,
		"optimization_possible": evaluation.OptimizationPossible,
		"follow_up_question":    evaluation.FollowUpQuestion,
		"completed":             advancement.ShouldComplete,
		"current_phase":         advancement.NewPhase,
	})
}

// GetCodingProblem generates and returns the full coding problem JSON for a
// given interview, including examples, hints, and complexity hints.
// This is called by the frontend when current_phase == "coding" to display
// the problem statement in the Monaco editor.
func GetCodingProblem(r *scale.Request) scale.Response {
	interviewID := r.Param("id").Int64()

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)

	interview := interviewRepo.Objects().Where("id = ?", interviewID).First()
	if interview.ID == 0 {
		panic(scale.NotFoundError("interview not found"))
	}

	// Find the latest unanswered coding response
	responses := responseRepo.Objects().
		Where("interview_id = ? AND phase = ?", interviewID, PhaseCoding).
		Descending("created_at").
		All()

	for _, resp := range responses {
		if strings.TrimSpace(resp.Answer) == "" {
			// Return the existing metadata if populated
			if len(resp.ResponseMetadata) > 0 && string(resp.ResponseMetadata) != "null" {
				var problem codingProblemResult
				if err := json.Unmarshal(resp.ResponseMetadata, &problem); err == nil {
					return scale.JsonResponse(map[string]any{
						"response_id": resp.ID,
						"problem":     problem,
					})
				}
			}
			// Generate and store it
			ctx := phaseContextFromInterview(interview)
			problem, err := GenerateCodingProblemFull(interview, ctx)
			if err != nil {
				panic(scale.InternalServerError("failed to generate coding problem", err))
			}
			metaBytes, _ := json.Marshal(problem)
			responseRepo.Update(int64(resp.ID), &model.Response{
				ResponseMetadata: metaBytes,
			}, "ResponseMetadata")
			return scale.JsonResponse(map[string]any{
				"response_id": resp.ID,
				"problem":     problem,
			})
		}
	}

	panic(scale.NotFoundError("no active coding question found"))
}
