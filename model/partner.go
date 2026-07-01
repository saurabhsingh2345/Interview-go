package model

import (
	"time"

	"github.com/eskeon/scale/scale"
)

// Partner is a third-party application authorized to call the interview API.
type Partner struct {
	scale.BaseModel

	Name   string `gorm:"type:varchar(255);not null" json:"name"`
	Email  string `gorm:"type:varchar(255)" json:"email"`
	Active bool   `gorm:"not null;default:true" json:"active"`

	APIKeys []APIKey `gorm:"foreignKey:PartnerID;constraint:OnDelete:CASCADE" json:"-"`
}

// APIKey is a bearer credential belonging to a Partner. The raw key is shown
// only once at creation time; only its SHA-256 hash is persisted.
type APIKey struct {
	scale.BaseModel

	PartnerID  int64      `gorm:"index;not null" json:"partner_id"`
	Name       string     `gorm:"type:varchar(255)" json:"name"`
	KeyHash    string     `gorm:"type:varchar(64);uniqueIndex;not null" json:"-"`
	KeyPrefix  string     `gorm:"type:varchar(16)" json:"key_prefix"`
	Active     bool       `gorm:"not null;default:true" json:"active"`
	LastUsedAt *time.Time `json:"last_used_at,omitempty"`
	ExpiresAt  *time.Time `json:"expires_at,omitempty"`
}
