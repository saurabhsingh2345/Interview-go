package model

import "github.com/eskeon/scale/scale"

type Interview struct {
	scale.BaseModel

	Topic  string `gorm:"not null" json:"topic"`
	Status string `gorm:"type:varchar(20);default:'in_progress'" json:"status"`
	Score  string `json:"score"`

	Responses []Response `gorm:"foreignKey:InterviewID;constraint:OnDelete:CASCADE"`
}

type Response struct {
	scale.BaseModel

	InterviewID uint   `gorm:"index;not null"`
	QuestionNum int    `json:"question_num"`
	Question    string `gorm:"type:text" json:"question"`
	Answer      string `gorm:"type:text" json:"answer"`
	Score       int    `json:"score"`
	Feedback    string `gorm:"type:text" json:"feedback"`
	IsFollowUp  bool   `json:"is_follow_up"`
	ParentID    *uint  `gorm:"index" json:"parent_id"`

	Evaluation      *Evaluation      `gorm:"foreignKey:ResponseID;constraint:OnDelete:CASCADE"`
	FollowUpContext *FollowUpContext `gorm:"foreignKey:ResponseID;constraint:OnDelete:CASCADE"`
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
}

type FollowUpContext struct {
	scale.BaseModel

	ResponseID    uint   `gorm:"uniqueIndex;not null" json:"response_id"`
	Reasoning     string `gorm:"type:text" json:"reasoning"`
	Difficulty    string `gorm:"type:varchar(20)" json:"difficulty"`
	ConceptTested string `json:"concept_tested"`
}
