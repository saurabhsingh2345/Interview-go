package handles

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go-app/model"

	"github.com/eskeon/scale/scale"
)

type ctxKey string

const partnerCtxKey ctxKey = "partner"

// boundInterviewCtxKey carries the single interview id a session token may act on.
const boundInterviewCtxKey ctxKey = "bound_interview_id"

// interviewPathRe extracts the interview id from /api/v1/interviews/{id}[/...].
var interviewPathRe = regexp.MustCompile(`^/api/v1/interviews/(\d+)`)

// interviewIDFromPath returns the {id} in /api/v1/interviews/{id}[/...], if any.
func interviewIDFromPath(path string) (int64, bool) {
	m := interviewPathRe.FindStringSubmatch(path)
	if m == nil {
		return 0, false
	}
	var id int64
	for _, c := range m[1] {
		id = id*10 + int64(c-'0')
	}
	return id, true
}

// HashAPIKey returns the SHA-256 hex digest used to look up a raw bearer key.
func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

// authRequired reports whether unauthenticated calls are rejected.
// Defaults to true; set REQUIRE_API_KEY=false for local/first-party dev.
func authRequired() bool {
	return !strings.EqualFold(os.Getenv("REQUIRE_API_KEY"), "false")
}

func writeAuthJSON(w http.ResponseWriter, status int, msg string) {
	// This middleware runs outside Scale's CORS middleware, so set CORS headers
	// here too — otherwise the browser reports a 401 as an opaque "Failed to
	// fetch" (CORS) error instead of the real status.
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "error": msg})
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	}
	return ""
}

// APIKeyAuth authenticates third-party callers via `Authorization: Bearer <key>`.
//
// It runs outside Scale's recover/CORS middleware, so it must not panic and must
// write its own response. CORS preflight (OPTIONS) and /health pass through.
// When REQUIRE_API_KEY=false, missing keys are allowed (first-party dev), but a
// supplied key is still validated and attaches the partner to the request.
func APIKeyAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodOptions || r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		// Unauthenticated by design (the launch token IS the credential), but
		// still IP-rate-limited: it's the one endpoint an attacker could hit
		// repeatedly while guessing/replaying a token.
		if r.URL.Path == "/api/v1/session/exchange" {
			if rateLimited(w, ipLimiter, clientIP(r)) {
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		raw := bearerToken(r)

		// Browser session token (it_sess_): scoped to a single interview, so the
		// partner API key never reaches the candidate's browser.
		if strings.HasPrefix(raw, SessionTokenPrefix) {
			authenticateSession(next, w, r, raw)
			return
		}

		if raw == "" {
			if authRequired() {
				if rateLimited(w, ipLimiter, clientIP(r)) {
					return
				}
				writeAuthJSON(w, http.StatusUnauthorized, "Unauthorized")
				return
			}
			next.ServeHTTP(w, r)
			return
		}

		db := scale.App.DB()

		var key model.APIKey
		if err := db.Where("key_hash = ? AND active = ?", HashAPIKey(raw), true).First(&key).Error; err != nil {
			// Rate-limit by IP, not the (invalid) key, so a brute-force attempt
			// can't dodge the limiter by cycling through guessed keys.
			if rateLimited(w, ipLimiter, clientIP(r)) {
				return
			}
			writeAuthJSON(w, http.StatusUnauthorized, "Invalid API key")
			return
		}
		if key.ExpiresAt != nil && key.ExpiresAt.Before(time.Now()) {
			writeAuthJSON(w, http.StatusUnauthorized, "API key expired")
			return
		}
		if rateLimited(w, partnerKeyLimiter, strconv.FormatInt(key.ID, 10)) {
			return
		}

		var partner model.Partner
		if err := db.First(&partner, key.PartnerID).Error; err != nil || !partner.Active {
			writeAuthJSON(w, http.StatusUnauthorized, "Unauthorized")
			return
		}

		// Best-effort usage tracking; never block the request on it.
		now := time.Now()
		db.Model(&model.APIKey{}).Where("id = ?", key.ID).Update("last_used_at", now)

		ctx := context.WithValue(r.Context(), partnerCtxKey, &partner)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// authenticateSession validates an it_sess_ token, enforces single-interview
// scope, attaches the owning partner + bound interview id, and proceeds.
func authenticateSession(next http.Handler, w http.ResponseWriter, r *http.Request, raw string) {
	db := scale.App.DB()

	var sess model.InterviewSession
	if err := db.Where("token_hash = ?", HashAPIKey(raw)).First(&sess).Error; err != nil {
		if rateLimited(w, ipLimiter, clientIP(r)) {
			return
		}
		writeAuthJSON(w, http.StatusUnauthorized, "Invalid session token")
		return
	}
	if sess.ExpiresAt.Before(time.Now()) {
		writeAuthJSON(w, http.StatusUnauthorized, "Session expired")
		return
	}
	if rateLimited(w, sessionLimiter, strconv.FormatInt(sess.ID, 10)) {
		return
	}

	// Scope guard: a session token may only act on its own interview.
	if pid, ok := interviewIDFromPath(r.URL.Path); ok && pid != sess.InterviewID {
		writeAuthJSON(w, http.StatusNotFound, "interview not found")
		return
	}

	var partner model.Partner
	if err := db.First(&partner, sess.PartnerID).Error; err != nil || !partner.Active {
		writeAuthJSON(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	ctx := context.WithValue(r.Context(), partnerCtxKey, &partner)
	ctx = context.WithValue(ctx, boundInterviewCtxKey, sess.InterviewID)
	next.ServeHTTP(w, r.WithContext(ctx))
}

// BoundInterviewID returns the interview a session token is locked to, and true
// when the caller is a session (false for partner-key or unauthenticated calls).
func BoundInterviewID(r *scale.Request) (int64, bool) {
	if id, ok := r.Request.Context().Value(boundInterviewCtxKey).(int64); ok {
		return id, true
	}
	return 0, false
}

// EnforceInterviewScope rejects a session token acting on an interview other than
// its own. No-op for partner-key callers. Use in handlers that take interview_id
// from the body/query (the voice loop) rather than the path.
func EnforceInterviewScope(r *scale.Request, interviewID int64) {
	if bound, ok := BoundInterviewID(r); ok && bound != interviewID {
		panic(scale.NotFoundError("interview not found"))
	}
}

// AssertInterviewAccess rejects the caller if the interview is not theirs. It
// enforces both partner tenancy (a partner sees only its own interviews) and
// session scope (a session token may only touch its bound interview). No-op for
// unauthenticated first-party dev (REQUIRE_API_KEY=false, no partner).
func AssertInterviewAccess(r *scale.Request, interview *model.Interview) {
	if pid := CurrentPartnerID(r); pid > 0 {
		if interview.PartnerID == nil || *interview.PartnerID != pid {
			panic(scale.NotFoundError("interview not found"))
		}
	}
	EnforceInterviewScope(r, interview.ID)
}

// PartnerFromRequest returns the authenticated partner, or nil when the request
// is unauthenticated (only possible with REQUIRE_API_KEY=false).
func PartnerFromRequest(r *scale.Request) *model.Partner {
	if p, ok := r.Request.Context().Value(partnerCtxKey).(*model.Partner); ok {
		return p
	}
	return nil
}

// CurrentPartnerID returns the authenticated partner id, or 0 when none.
func CurrentPartnerID(r *scale.Request) int64 {
	if p := PartnerFromRequest(r); p != nil {
		return p.ID
	}
	return 0
}
