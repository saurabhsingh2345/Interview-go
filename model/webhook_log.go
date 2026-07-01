package model

import "github.com/eskeon/scale/scale"

// WebhookLog records one delivery attempt of a partner completion webhook, for
// audit and debugging. Multiple rows share an (interview_id, event) when a
// delivery is retried.
type WebhookLog struct {
	scale.BaseModel

	InterviewID int64  `gorm:"index;not null" json:"interview_id"`
	PartnerID   *int64 `gorm:"index" json:"partner_id,omitempty"`
	Event       string `gorm:"type:varchar(64);not null" json:"event"`
	URL         string `gorm:"type:text;not null" json:"url"`
	Attempt     int    `gorm:"not null" json:"attempt"`
	StatusCode  int    `json:"status_code,omitempty"`
	Success     bool   `gorm:"not null;default:false" json:"success"`
	Error       string `gorm:"type:text" json:"error,omitempty"`
}
