package handles

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"go-app/model"

	"github.com/eskeon/scale/scale"
	"github.com/eskeon/scale/scale/logger"
)

// SessionTokenPrefix marks a browser session credential (vs. a partner API key).
const SessionTokenPrefix = "it_sess_"

// Token lifetimes.
const (
	launchTokenTTL  = 10 * time.Minute // redirect token: survive the hop + exchange
	sessionTTL      = 2 * time.Hour    // browser session token lifetime
	launchClockSkew = 60 * time.Second // tolerance on launch-token expiry
)

// LaunchClaims is the payload encrypted into the redirect URL's ?t= token. It
// only needs to authorize the browser for one interview — the candidate params
// themselves are stored server-side at create time.
type LaunchClaims struct {
	Ver         int    `json:"ver"`
	InterviewID int64  `json:"interview_id"`
	PartnerID   int64  `json:"partner_id"`
	JTI         string `json:"jti"`
	IssuedAt    int64  `json:"iat"`
	ExpiresAt   int64  `json:"exp"`
}

type exchangeBody struct {
	Token string `json:"token"`
}

// handoffSecret is the shared key for launch-token encryption. Empty fails closed.
func handoffSecret() string {
	return os.Getenv("INTERVIEW_HANDOFF_SECRET")
}

// interviewAppURL is the candidate-facing frontend origin (no trailing slash).
func interviewAppURL() string {
	return strings.TrimRight(os.Getenv("INTERVIEW_APP_URL"), "/")
}

// randomHex returns n random bytes hex-encoded (2n chars).
func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(scale.InternalServerError("random generation failed", err))
	}
	return hex.EncodeToString(b)
}

// BuildRedirectURL mints a one-time launch token for an interview and returns the
// candidate-facing URL the partner should redirect their user to. Returns "" when
// INTERVIEW_APP_URL or INTERVIEW_HANDOFF_SECRET is unset (caller falls back).
func BuildRedirectURL(interview *model.Interview, partnerID int64) string {
	base := interviewAppURL()
	secret := handoffSecret()
	if base == "" || secret == "" {
		return ""
	}
	now := time.Now()
	claims := LaunchClaims{
		Ver:         1,
		InterviewID: interview.ID,
		PartnerID:   partnerID,
		JTI:         randomHex(16),
		IssuedAt:    now.Unix(),
		ExpiresAt:   now.Add(launchTokenTTL).Unix(),
	}
	token := scale.EncryptStruct(claims, secret)
	return fmt.Sprintf("%s/interview/%d?t=%s", base, interview.ID, url.QueryEscape(token))
}

// ExchangeSession trades a one-time launch token for a short-lived,
// interview-scoped session token. Unauthenticated — the launch token IS the auth.
func ExchangeSession(r *scale.Request) scale.Response {
	body := scale.Parse[exchangeBody](r)
	token := strings.TrimSpace(body.Token)
	if token == "" {
		panic(scale.BadRequestError("token is required"))
	}

	secret := handoffSecret()
	if secret == "" {
		logger.Errorf("session exchange attempted but INTERVIEW_HANDOFF_SECRET is unset")
		panic(scale.BadRequestError("invalid token"))
	}

	// DecryptStruct panics BadRequestError("invalid data") on tamper/wrong key.
	claims := scale.DecryptStruct[LaunchClaims](token, secret)

	if claims.Ver != 1 {
		panic(scale.BadRequestError("unsupported token version"))
	}
	if claims.ExpiresAt > 0 && time.Now().After(time.Unix(claims.ExpiresAt, 0).Add(launchClockSkew)) {
		panic(scale.UnauthorizedError("token expired"))
	}
	if claims.InterviewID == 0 || strings.TrimSpace(claims.JTI) == "" {
		panic(scale.BadRequestError("invalid token"))
	}

	db := scale.App.DB()

	var interview model.Interview
	if err := db.First(&interview, claims.InterviewID).Error; err != nil {
		panic(scale.NotFoundError("interview not found"))
	}
	if interview.PartnerID == nil || *interview.PartnerID != claims.PartnerID {
		panic(scale.NotFoundError("interview not found"))
	}

	// One-time use: claim the jti. Duplicate insert => token already exchanged.
	jti := model.HandoffJTI{JTI: claims.JTI, ExpiresAt: time.Unix(claims.ExpiresAt, 0)}
	if err := db.Create(&jti).Error; err != nil {
		panic(scale.ConflictError("token already used"))
	}

	raw, hash := newSessionToken()
	session := model.InterviewSession{
		InterviewID:    interview.ID,
		PartnerID:      claims.PartnerID,
		TokenHash:      hash,
		CandidateName:  interview.CandidateName,
		CandidateEmail: interview.CandidateEmail,
		ExpiresAt:      time.Now().Add(sessionTTL),
	}
	if err := db.Create(&session).Error; err != nil {
		panic(scale.InternalServerError("could not create session", err))
	}

	logger.Infof("session exchanged: interview=%d partner=%d", interview.ID, claims.PartnerID)

	return scale.JsonResponse(map[string]any{
		"session_token": raw,
		"expires_at":    session.ExpiresAt.Unix(),
		"interview": map[string]any{
			"id":            interview.ID,
			"topic":         interview.Topic,
			"status":        interview.Status,
			"current_phase": interview.CurrentPhase,
			"score":         interview.Score,
			"redirect_url":  interview.RedirectURL,
		},
		"candidate": map[string]any{
			"name":  interview.CandidateName,
			"email": interview.CandidateEmail,
		},
	})
}

// newSessionToken returns a random it_sess_ token and its SHA-256 hex hash.
func newSessionToken() (raw, hash string) {
	raw = SessionTokenPrefix + randomHex(32)
	return raw, HashAPIKey(raw)
}
