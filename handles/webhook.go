package handles

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"time"

	"go-app/model"

	"github.com/eskeon/scale/scale"
	"github.com/eskeon/scale/scale/logger"
)

// completionWebhookClient has a short timeout so a slow/missing receiver never
// stalls the request that triggered completion.
var completionWebhookClient = &http.Client{Timeout: 8 * time.Second}

// FireInterviewCompleted POSTs a signed "interview.completed" payload to the
// interview's callback_url, if set. Best-effort and asynchronous: it never
// blocks or fails the caller. Signature: HMAC-SHA256 of the body using the
// WEBHOOK_SECRET env, sent as `X-Webhook-Signature: sha256=<hex>` (omitted when
// no secret is configured).
func FireInterviewCompleted(interviewID int64) {
	go func() {
		defer func() {
			if rec := recover(); rec != nil {
				logger.Errorf("completion webhook panic for interview %d: %v", interviewID, rec)
			}
		}()

		var interview model.Interview
		if err := scale.App.DB().First(&interview, interviewID).Error; err != nil {
			logger.Errorf("completion webhook: load interview %d: %v", interviewID, err)
			return
		}
		if interview.CallbackURL == "" {
			return
		}

		payload := map[string]any{
			"event":           "interview.completed",
			"interview_id":    interview.ID,
			"topic":           interview.Topic,
			"status":          interview.Status,
			"score":           interview.Score,
			"external_id":     interview.ExternalID,
			"candidate_email": interview.CandidateEmail,
			"program_id":      interview.ProgramID,
			"session_id":      interview.SessionID,
			"practice_id":     interview.PracticeID,
			"completed_at":    time.Now().UTC().Format(time.RFC3339),
		}
		bodyBytes, err := json.Marshal(payload)
		if err != nil {
			logger.Errorf("completion webhook: marshal interview %d: %v", interview.ID, err)
			return
		}

		req, err := http.NewRequest(http.MethodPost, interview.CallbackURL, bytes.NewReader(bodyBytes))
		if err != nil {
			logger.Errorf("completion webhook: build request for interview %d: %v", interview.ID, err)
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Webhook-Event", "interview.completed")
		if secret := os.Getenv("WEBHOOK_SECRET"); secret != "" {
			mac := hmac.New(sha256.New, []byte(secret))
			mac.Write(bodyBytes)
			req.Header.Set("X-Webhook-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
		}

		resp, err := completionWebhookClient.Do(req)
		if err != nil {
			logger.Errorf("completion webhook: POST interview %d to %s: %v", interview.ID, interview.CallbackURL, err)
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode >= http.StatusBadRequest {
			logger.Warningf("completion webhook: interview %d -> %s returned %d", interview.ID, interview.CallbackURL, resp.StatusCode)
			return
		}
		logger.Infof("completion webhook delivered: interview %d -> %s (%d)", interview.ID, interview.CallbackURL, resp.StatusCode)
	}()
}
