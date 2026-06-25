package model

import "github.com/eskeon/scale/scale"

type InterviewReport struct {
	scale.BaseModel

	InterviewID                int64   `gorm:"uniqueIndex;not null" json:"interview_id"`
	OverallScore               float64 `gorm:"type:numeric(5,2)" json:"overall_score"`
	CommunicationScore         float64 `gorm:"type:numeric(5,2)" json:"communication_score"`
	TechnicalScore             float64 `gorm:"type:numeric(5,2)" json:"technical_score"`
	CodingScore                float64 `gorm:"type:numeric(5,2)" json:"coding_score"`
	BehavioralScore            float64 `gorm:"type:numeric(5,2)" json:"behavioral_score"`
	ConsistencyScore           float64 `gorm:"type:numeric(5,2)" json:"consistency_score"`
	ConfidenceCalibrationScore float64 `gorm:"type:numeric(5,2)" json:"confidence_calibration_score"`
	Strengths                  string  `gorm:"type:text" json:"strengths"`
	Weaknesses                 string  `gorm:"type:text" json:"weaknesses"`
	ImprovementPlan            string  `gorm:"type:text" json:"improvement_plan"`
}
