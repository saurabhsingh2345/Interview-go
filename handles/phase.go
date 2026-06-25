package handles

import "go-app/model"

const (
	PhaseIntroduction  = "introduction"
	PhaseFundamentals  = "fundamentals"
	PhaseDeepTechnical = "deep_technical"
	PhaseBehavioral    = "behavioral"
	PhaseSystemDesign  = "system_design"
	PhaseCoding        = "coding"
	PhaseWrapUp        = "wrap_up"

	CandidateLevelBeginner     = "beginner"
	CandidateLevelIntermediate = "intermediate"
	CandidateLevelSenior       = "senior"

	DifficultyEasy   = "easy"
	DifficultyMedium = "medium"
	DifficultyHard   = "hard"
)

// phaseMaxQuestions defines how many main questions belong to each phase.
var phaseMaxQuestions = map[string]int{
	PhaseIntroduction:  3,
	PhaseFundamentals:  4,
	PhaseDeepTechnical: 4,
	PhaseCoding:        2,
	PhaseBehavioral:    3,
	PhaseSystemDesign:  3,
	PhaseWrapUp:        2,
}

// Phase order: introduction → fundamentals → deep_technical → behavioral
// → system_design (senior only) → wrap_up → complete
func nextPhaseFor(current, candidateLevel string) string {
	switch current {
	case PhaseIntroduction:
		return PhaseFundamentals
	case PhaseFundamentals:
		return PhaseDeepTechnical
	case PhaseDeepTechnical:
		return PhaseCoding
	case PhaseCoding:
		return PhaseBehavioral
	case PhaseBehavioral:
		if candidateLevel == CandidateLevelSenior {
			return PhaseSystemDesign
		}
		return PhaseWrapUp
	case PhaseSystemDesign:
		return PhaseWrapUp
	case PhaseWrapUp:
		return "complete"
	default:
		return PhaseFundamentals
	}
}

func difficultyFromEstimate(estimate float64) string {
	if estimate <= 3.0 {
		return DifficultyEasy
	}
	if estimate <= 6.0 {
		return DifficultyMedium
	}
	return DifficultyHard
}

func updateSkillEstimate(current float64, score int) float64 {
	if score >= 8 {
		current += 0.5
	} else if score < 5 {
		current -= 0.5
	}
	if current > 10.0 {
		return 10.0
	}
	if current < 0.0 {
		return 0.0
	}
	return current
}

// PhaseContext carries current phase state into LLM calls.
type PhaseContext struct {
	Phase          string
	CandidateLevel string
	SkillEstimate  float64
	Difficulty     string
}

// PhaseAdvancement describes the result of processing one main-question answer.
type PhaseAdvancement struct {
	NewPhase         string
	NewPhaseCount    int
	NewSkillEstimate float64
	ShouldComplete   bool
}

// computePhaseAdvancement increments the phase counter, updates the skill
// estimate, and transitions to the next phase when the max question count is
// reached. Only call this for main-question answers (not follow-ups).
func computePhaseAdvancement(interview *model.Interview, evaluationScore int) PhaseAdvancement {
	phase := interview.CurrentPhase
	if phase == "" {
		phase = PhaseIntroduction
	}
	level := interview.CandidateLevel
	if level == "" {
		level = CandidateLevelIntermediate
	}
	estimate := interview.SkillEstimate
	if estimate == 0 {
		estimate = 5.0
	}

	newEstimate := updateSkillEstimate(estimate, evaluationScore)
	newCount := interview.PhaseQuestionCount + 1

	maxQ := phaseMaxQuestions[phase]
	if maxQ == 0 {
		maxQ = 3
	}

	if newCount >= maxQ {
		next := nextPhaseFor(phase, level)
		if next == "complete" {
			return PhaseAdvancement{
				NewPhase:         phase,
				NewPhaseCount:    newCount,
				NewSkillEstimate: newEstimate,
				ShouldComplete:   true,
			}
		}
		return PhaseAdvancement{
			NewPhase:         next,
			NewPhaseCount:    0,
			NewSkillEstimate: newEstimate,
		}
	}

	return PhaseAdvancement{
		NewPhase:         phase,
		NewPhaseCount:    newCount,
		NewSkillEstimate: newEstimate,
	}
}

// phaseContextFromInterview derives the current PhaseContext from an Interview,
// applying sensible defaults for interviews created before the phase system.
func phaseContextFromInterview(interview *model.Interview) PhaseContext {
	phase := interview.CurrentPhase
	if phase == "" {
		phase = PhaseIntroduction
	}
	level := interview.CandidateLevel
	if level == "" {
		level = CandidateLevelIntermediate
	}
	estimate := interview.SkillEstimate
	if estimate == 0 {
		estimate = 5.0
	}
	return PhaseContext{
		Phase:          phase,
		CandidateLevel: level,
		SkillEstimate:  estimate,
		Difficulty:     difficultyFromEstimate(estimate),
	}
}
