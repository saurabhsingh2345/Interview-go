package handles

import (
	"encoding/json"
	"fmt"
	"go-app/model"
	"math"
	"strings"

	"github.com/eskeon/scale/scale"
)

// ─── API handlers ─────────────────────────────────────────────────────────────

// GetInterviewReport returns the report for an interview, generating it on-demand
// if it does not exist yet.
func GetInterviewReport(r *scale.Request) scale.Response {
	id := r.Param("id").Int64()

	reportRepo := scale.WR[model.InterviewReport](r)
	existing := reportRepo.Objects().Where("interview_id = ?", id).FirstOrNil()
	if existing != nil {
		return scale.JsonResponse(existing)
	}

	interviewRepo := scale.WR[model.Interview](r)
	responseRepo := scale.WR[model.Response](r)

	interview := interviewRepo.Objects().Where("id = ?", id).First()
	if interview.ID == 0 {
		panic(scale.NotFoundError("interview not found"))
	}
	if interview.Status != "completed" {
		panic(scale.BadRequestError("interview not completed yet"))
	}

	responses := responseRepo.Objects().
		Where("interview_id = ?", id).
		Preload("Evaluation").
		Preload("FollowUpContext").
		Ascending("question_num", "created_at").
		All()

	report := computeInterviewReport(interview, responses)
	created := reportRepo.Create(report)
	return scale.JsonResponse(created)
}

// GetInterviewTranscript returns the full ordered transcript for an interview.
func GetInterviewTranscript(r *scale.Request) scale.Response {
	id := r.Param("id").Int64()

	responseRepo := scale.WR[model.Response](r)
	responses := responseRepo.Objects().
		Where("interview_id = ?", id).
		Preload("Evaluation").
		Preload("FollowUpContext").
		Ascending("question_num", "created_at").
		All()

	type entry struct {
		ID              int64                  `json:"id"`
		QuestionNum     int                    `json:"question_num"`
		Phase           string                 `json:"phase"`
		Difficulty      string                 `json:"difficulty"`
		IsFollowUp      bool                   `json:"is_follow_up"`
		Question        string                 `json:"question"`
		Answer          string                 `json:"answer"`
		Score           int                    `json:"score"`
		Evaluation      *model.Evaluation      `json:"evaluation,omitempty"`
		FollowUpContext *model.FollowUpContext  `json:"follow_up_context,omitempty"`
	}

	out := make([]entry, 0, len(responses))
	for _, resp := range responses {
		out = append(out, entry{
			ID:              resp.ID,
			QuestionNum:     resp.QuestionNum,
			Phase:           resp.Phase,
			Difficulty:      resp.Difficulty,
			IsFollowUp:      resp.IsFollowUp,
			Question:        resp.Question,
			Answer:          resp.Answer,
			Score:           resp.Score,
			Evaluation:      resp.Evaluation,
			FollowUpContext: resp.FollowUpContext,
		})
	}

	return scale.JsonResponse(map[string]any{
		"interview_id": id,
		"transcript":   out,
		"count":        len(out),
	})
}

// ─── Score computation ────────────────────────────────────────────────────────

func computeInterviewReport(interview *model.Interview, responses []*model.Response) *model.InterviewReport {
	communication := avgField(responses, func(ev *model.Evaluation) float64 { return float64(ev.Clarity) })
	technical := avgFieldByPhase(responses, []string{PhaseFundamentals, PhaseDeepTechnical}, func(ev *model.Evaluation) float64 {
		return (float64(ev.Correctness) + float64(ev.Depth)) / 2
	})
	coding := avgFieldByPhase(responses, []string{PhaseCoding}, func(ev *model.Evaluation) float64 {
		return (float64(ev.Correctness) + float64(ev.Depth)) / 2
	})
	behavioral := avgFieldByPhase(responses, []string{PhaseBehavioral}, func(ev *model.Evaluation) float64 {
		if ev.STARSituation+ev.STARTask+ev.STARAction+ev.STARResult == 0 {
			return float64(ev.Correctness) // fallback if STAR not populated
		}
		return (ev.STARSituation + ev.STARTask + ev.STARAction + ev.STARResult) / 4
	})
	consistency := computeConsistencyScore(responses)
	calibration := computeCalibrationScore(responses)

	overall := communication*0.15 + technical*0.35 + coding*0.20 + behavioral*0.20 + consistency*0.05 + calibration*0.05

	report := &model.InterviewReport{
		InterviewID:                interview.ID,
		OverallScore:               roundScore(overall),
		CommunicationScore:         roundScore(communication),
		TechnicalScore:             roundScore(technical),
		CodingScore:                roundScore(coding),
		BehavioralScore:            roundScore(behavioral),
		ConsistencyScore:           roundScore(consistency),
		ConfidenceCalibrationScore: roundScore(calibration),
	}

	// Generate narrative via LLM
	narrative := generateReportNarrative(interview, report, responses)
	report.Strengths = narrative.Strengths
	report.Weaknesses = narrative.Weaknesses
	report.ImprovementPlan = narrative.ImprovementPlan

	return report
}

func avgField(responses []*model.Response, fn func(*model.Evaluation) float64) float64 {
	var total float64
	var count int
	for _, r := range responses {
		if r.Evaluation != nil {
			total += fn(r.Evaluation)
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return total / float64(count)
}

func avgFieldByPhase(responses []*model.Response, phases []string, fn func(*model.Evaluation) float64) float64 {
	phaseSet := make(map[string]bool, len(phases))
	for _, p := range phases {
		phaseSet[p] = true
	}
	var total float64
	var count int
	for _, r := range responses {
		if phaseSet[r.Phase] && r.Evaluation != nil {
			total += fn(r.Evaluation)
			count++
		}
	}
	if count == 0 {
		return 0
	}
	return total / float64(count)
}

func computeConsistencyScore(responses []*model.Response) float64 {
	conceptScores := make(map[string][]int)
	for _, r := range responses {
		if r.FollowUpContext != nil && r.FollowUpContext.ConceptTested != "" {
			concept := r.FollowUpContext.ConceptTested
			conceptScores[concept] = append(conceptScores[concept], r.Score)
		}
	}

	var variances []float64
	for _, scores := range conceptScores {
		if len(scores) < 2 {
			continue
		}
		sum := 0.0
		for _, s := range scores {
			sum += float64(s)
		}
		mean := sum / float64(len(scores))
		variance := 0.0
		for _, s := range scores {
			d := float64(s) - mean
			variance += d * d
		}
		variance /= float64(len(scores))
		variances = append(variances, variance)
	}

	if len(variances) == 0 {
		return 10.0
	}
	avgVariance := 0.0
	for _, v := range variances {
		avgVariance += v
	}
	avgVariance /= float64(len(variances))

	score := 10.0 - avgVariance
	if score < 0 {
		return 0
	}
	return score
}

func computeCalibrationScore(responses []*model.Response) float64 {
	var total float64
	var count int
	for _, r := range responses {
		if r.Evaluation != nil && r.Evaluation.ExpressedConfidence > 0 {
			delta := math.Abs(float64(r.Evaluation.Correctness) - r.Evaluation.ExpressedConfidence)
			total += delta
			count++
		}
	}
	if count == 0 {
		return 10.0
	}
	calibrationDelta := total / float64(count)
	score := 10.0 - calibrationDelta
	if score < 0 {
		return 0
	}
	return score
}

func roundScore(v float64) float64 {
	return math.Round(v*100) / 100
}

// ─── Narrative report ─────────────────────────────────────────────────────────

type reportNarrative struct {
	Strengths       string
	Weaknesses      string
	ImprovementPlan string
}

type narrativeJSON struct {
	Strengths       []string `json:"strengths"`
	Weaknesses      []string `json:"weaknesses"`
	ImprovementPlan string   `json:"improvement_plan"`
}

func generateReportNarrative(interview *model.Interview, report *model.InterviewReport, responses []*model.Response) reportNarrative {
	// Build a compact transcript (at most 15 pairs to stay under token budget)
	var pairs []string
	for _, r := range responses {
		if r.Answer == "" {
			continue
		}
		ev := ""
		if r.Evaluation != nil {
			ev = fmt.Sprintf(" | score=%d expressed_conf=%.1f", r.Evaluation.Correctness, r.Evaluation.ExpressedConfidence)
		}
		pairs = append(pairs, fmt.Sprintf("[%s Q%d] %s\nA: %s%s", r.Phase, r.QuestionNum, r.Question, r.Answer, ev))
		if len(pairs) >= 15 {
			break
		}
	}

	userPrompt := fmt.Sprintf(
		"Candidate completed a %s interview.\n"+
			"Scores: overall=%.2f, technical=%.2f, communication=%.2f, behavioral=%.2f, coding=%.2f, consistency=%.2f, confidence_calibration=%.2f\n\n"+
			"Transcript:\n%s\n\n"+
			"Generate JSON with exactly these keys:\n"+
			"- strengths: array of 3-5 specific strength statements with evidence\n"+
			"- weaknesses: array of 3-5 specific gap statements with evidence\n"+
			"- improvement_plan: week-by-week study plan (4 weeks) targeting the weaknesses, naming exact topics, resources, and practice types\n\n"+
			"Return JSON only.",
		interview.Topic,
		report.OverallScore, report.TechnicalScore, report.CommunicationScore,
		report.BehavioralScore, report.CodingScore, report.ConsistencyScore, report.ConfidenceCalibrationScore,
		strings.Join(pairs, "\n---\n"),
	)

	var raw narrativeJSON
	err := callGroqJSON([]groqMessage{
		{Role: "system", Content: "You are a senior hiring manager writing an interview debrief report. Be honest, specific, and actionable. Do not be vague. Respond only as JSON."},
		{Role: "user", Content: userPrompt},
	}, &raw)

	if err != nil {
		// Graceful fallback
		return reportNarrative{
			Strengths:       "[]",
			Weaknesses:      "[]",
			ImprovementPlan: "Report narrative unavailable.",
		}
	}

	strengthsJSON, _ := json.Marshal(raw.Strengths)
	weaknessesJSON, _ := json.Marshal(raw.Weaknesses)

	return reportNarrative{
		Strengths:       string(strengthsJSON),
		Weaknesses:      string(weaknessesJSON),
		ImprovementPlan: strings.TrimSpace(raw.ImprovementPlan),
	}
}
