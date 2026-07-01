package model

import (
	"time"

	"github.com/eskeon/scale/scale"
)

// InterviewSession is a short-lived, interview-scoped browser credential minted
// by POST /api/v1/session/exchange. The raw token (it_sess_...) is returned once;
// only its SHA-256 hash is persisted. A session may act on exactly one interview.
type InterviewSession struct {
	scale.BaseModel

	InterviewID    int64     `gorm:"index;not null" json:"interview_id"`
	PartnerID      int64     `gorm:"index;not null" json:"partner_id"`
	TokenHash      string    `gorm:"type:varchar(64);uniqueIndex;not null" json:"-"`
	CandidateName  string    `gorm:"type:varchar(255)" json:"candidate_name"`
	CandidateEmail string    `gorm:"type:varchar(255)" json:"candidate_email"`
	ExpiresAt      time.Time `gorm:"not null" json:"expires_at"`
}

// HandoffJTI records a consumed launch-token nonce, enforcing one-time use of
// each launch (redirect) token. Rows can be purged after expires_at.
type HandoffJTI struct {
	JTI       string    `gorm:"primaryKey;type:varchar(64)" json:"jti"`
	ExpiresAt time.Time `gorm:"not null" json:"expires_at"`
}

func (HandoffJTI) TableName() string { return "handoff_jtis" }
