package model

import (
	"github.com/eskeon/scale/scale"
	"gorm.io/datatypes"
)

type Interview struct {
	scale.BaseModel

	Topic              string  `gorm:"not null" json:"topic"`
	Status             string  `gorm:"type:varchar(20);default:'in_progress'" json:"status"`
	Score              float64 `gorm:"type:numeric(5,2);default:0" json:"score"`
	CurrentPhase       string  `gorm:"type:varchar(30);default:'introduction'" json:"current_phase"`
	PhaseQuestionCount int     `gorm:"default:0" json:"phase_question_count"`
	CandidateLevel     string  `gorm:"type:varchar(20);default:'intermediate'" json:"candidate_level"`
	SkillEstimate      float64 `gorm:"type:numeric(4,2);default:5.0" json:"skill_estimate"`
	SessionSummary     string  `gorm:"type:text;default:''" json:"session_summary"`

	// Owning third-party partner (NULL = legacy / first-party).
	PartnerID *int64 `gorm:"index" json:"partner_id,omitempty"`

	// Candidate identity supplied by the partner at create time (redirect flow).
	CandidateName  string `gorm:"type:varchar(255);default:''" json:"candidate_name,omitempty"`
	CandidateEmail string `gorm:"type:varchar(255);default:''" json:"candidate_email,omitempty"`

	// ExternalID is the partner's own reference for this candidate/interview, so
	// they can fetch the report without storing our id.
	ExternalID string `gorm:"type:varchar(255);index;default:''" json:"external_id,omitempty"`

	// RedirectURL is where we send the candidate back on the partner's site when
	// the interview finishes (optional).
	RedirectURL string `gorm:"type:text;default:''" json:"redirect_url,omitempty"`

	// Optional webhook: POSTed a signed payload when the interview completes.
	CallbackURL string `gorm:"type:text;default:''" json:"callback_url,omitempty"`

	// Course context (optional — set when created from go-cloud)
	ProgramID *int64 `gorm:"index" json:"program_id,omitempty"`
	SessionID *int64 `gorm:"index" json:"session_id,omitempty"`
	// Unique per partner (idx_interviews_partner_practice), not globally — see
	// migration 011. A plain index here; the composite unique is created in SQL.
	PracticeID *int64 `gorm:"index" json:"practice_id,omitempty"`

	Responses []Response `gorm:"foreignKey:InterviewID;constraint:OnDelete:CASCADE"`
}

type Response struct {
	scale.BaseModel

	InterviewID      uint           `gorm:"index;not null"`
	QuestionNum      int            `json:"question_num"`
	Question         string         `gorm:"type:text" json:"question"`
	Answer           string         `gorm:"type:text" json:"answer"`
	Score            int            `json:"score"`
	Feedback         string         `gorm:"type:text" json:"feedback"`
	IsFollowUp       bool           `json:"is_follow_up"`
	ParentID         *uint          `gorm:"index" json:"parent_id"`
	Phase            string         `gorm:"type:varchar(30);default:'introduction'" json:"phase"`
	Difficulty       string         `gorm:"type:varchar(10);default:'medium'" json:"difficulty"`
	ResponseMetadata datatypes.JSON `gorm:"type:jsonb" json:"response_metadata,omitempty"`

	Evaluation      *Evaluation      `gorm:"foreignKey:ResponseID;constraint:OnDelete:CASCADE"`
	FollowUpContext *FollowUpContext  `gorm:"foreignKey:ResponseID;constraint:OnDelete:CASCADE"`
}

type Evaluation struct {
	scale.BaseModel

	ResponseID      uint   `gorm:"uniqueIndex;not null" json:"response_id"`
	Correctness     int    `json:"correctness"`
	Clarity         int    `json:"clarity"`
	Depth           int    `json:"depth"`
	Confidence      int    `json:"confidence"`
	AIFeedback      string `gorm:"type:text" json:"ai_feedback"`
	SuggestedAnswer string `gorm:"type:text" json:"suggested_answer"`

	// Step 2 – confidence calibration
	ExpressedConfidence float64 `gorm:"type:numeric(4,2);default:0" json:"expressed_confidence"`

	// Step 3 – STAR behavioral scores
	STARSituation float64 `gorm:"type:numeric(4,2);default:0" json:"star_situation"`
	STARTask      float64 `gorm:"type:numeric(4,2);default:0" json:"star_task"`
	STARAction    float64 `gorm:"type:numeric(4,2);default:0" json:"star_action"`
	STARResult    float64 `gorm:"type:numeric(4,2);default:0" json:"star_result"`

	// Step 3 – system design dimension scores
	SDScalability   float64 `gorm:"type:numeric(4,2);default:0" json:"sd_scalability"`
	SDComponents    float64 `gorm:"type:numeric(4,2);default:0" json:"sd_components"`
	SDTradeoffs     float64 `gorm:"type:numeric(4,2);default:0" json:"sd_tradeoffs"`
	SDCommunication float64 `gorm:"type:numeric(4,2);default:0" json:"sd_communication"`

	// Step 5 – code review fields
	TimeComplexity       string `gorm:"type:varchar(50);default:''" json:"time_complexity"`
	SpaceComplexity      string `gorm:"type:varchar(50);default:''" json:"space_complexity"`
	HasBugs              bool   `gorm:"default:false" json:"has_bugs"`
	BugDescription       string `gorm:"type:text;default:''" json:"bug_description"`
	OptimizationPossible bool   `gorm:"default:false" json:"optimization_possible"`
}

type FollowUpContext struct {
	scale.BaseModel

	ResponseID      uint   `gorm:"uniqueIndex;not null" json:"response_id"`
	Reasoning       string `gorm:"type:text" json:"reasoning"`
	Difficulty      string `gorm:"type:varchar(20)" json:"difficulty"`
	ConceptTested   string `json:"concept_tested"`
	SelectedBranch  string `gorm:"type:varchar(10);default:''" json:"selected_branch"`
	BranchReasoning string `gorm:"type:text;default:''" json:"branch_reasoning"`
}
