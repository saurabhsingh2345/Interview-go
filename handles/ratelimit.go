package handles

import (
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// rateLimiter is a simple in-memory fixed-window counter, keyed by an
// arbitrary identity string (API key id, session id, or client IP). Good
// enough for a single-instance deployment; entries are lazily evicted on
// access so the map never grows unbounded from short-lived identities.
type rateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*rateBucket
	limit   int
	window  time.Duration
}

type rateBucket struct {
	count   int
	resetAt time.Time
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{buckets: make(map[string]*rateBucket), limit: limit, window: window}
}

// allow reports whether the call identified by key may proceed, and if not,
// how long the caller should wait before retrying.
func (rl *rateLimiter) allow(key string) (bool, time.Duration) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	b, ok := rl.buckets[key]
	if !ok || now.After(b.resetAt) {
		b = &rateBucket{resetAt: now.Add(rl.window)}
		rl.buckets[key] = b
	}
	b.count++
	if b.count > rl.limit {
		return false, b.resetAt.Sub(now)
	}
	return true, 0
}

// envInt reads a positive integer from the environment, falling back to def.
func envInt(name string, def int) int {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return def
}

var (
	// partnerKeyLimiter throttles authenticated partner-key traffic (create,
	// list, report, etc.) — generous, since a partner's own backend drives it.
	partnerKeyLimiter = newRateLimiter(envInt("RATE_LIMIT_PARTNER_RPM", 120), time.Minute)

	// sessionLimiter throttles a single candidate's browser session — higher,
	// since the in-interview loop (question/answer/tts) polls frequently.
	sessionLimiter = newRateLimiter(envInt("RATE_LIMIT_SESSION_RPM", 300), time.Minute)

	// ipLimiter throttles unauthenticated/unidentified traffic by client IP:
	// the session-exchange endpoint and failed auth attempts (key brute-force
	// guard).
	ipLimiter = newRateLimiter(envInt("RATE_LIMIT_IP_RPM", 30), time.Minute)
)

// clientIP extracts the caller's address, preferring the first hop of
// X-Forwarded-For (set by our reverse proxy) and falling back to RemoteAddr.
func clientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		first, _, _ := strings.Cut(xff, ",")
		return strings.TrimSpace(first)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// rateLimited checks the given limiter/key and, if exceeded, writes a 429
// response and returns true (caller must stop processing the request).
func rateLimited(w http.ResponseWriter, rl *rateLimiter, key string) bool {
	ok, retryAfter := rl.allow(key)
	if ok {
		return false
	}
	w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
	writeAuthJSON(w, http.StatusTooManyRequests, "rate limit exceeded")
	return true
}
