package handles

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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

// webhookRetryBackoff is how long to wait before each retry attempt (index 0 =
// wait before attempt 2, etc.). A delivery that still fails after these is
// logged as a final failure and not retried further.
var webhookRetryBackoff = []time.Duration{5 * time.Second, 30 * time.Second}

// FireInterviewCompleted POSTs a signed "interview.completed" payload to the
// interview's callback_url, if set. Best-effort and asynchronous: it never
// blocks or fails the caller. Signature: HMAC-SHA256 of the body using the
// WEBHOOK_SECRET env, sent as `X-Webhook-Signature: sha256=<hex>` (omitted when
// no secret is configured). Every attempt (success or failure) is persisted to
// webhook_logs for audit/debugging; failed attempts are retried with backoff.
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

		for attempt := 1; ; attempt++ {
			statusCode, deliveryErr := deliverWebhook(interview.CallbackURL, bodyBytes)
			logWebhookAttempt(interview, attempt, statusCode, deliveryErr)

			if deliveryErr == nil {
				logger.Infof("completion webhook delivered: interview %d -> %s (%d) attempt %d", interview.ID, interview.CallbackURL, statusCode, attempt)
				return
			}
			logger.Warningf("completion webhook attempt %d failed: interview %d -> %s: %v", attempt, interview.ID, interview.CallbackURL, deliveryErr)

			if attempt > len(webhookRetryBackoff) {
				logger.Errorf("completion webhook gave up after %d attempts: interview %d -> %s", attempt, interview.ID, interview.CallbackURL)
				return
			}
			time.Sleep(webhookRetryBackoff[attempt-1])
		}
	}()
}

// deliverWebhook makes one delivery attempt and returns the response status
// code (0 if the request never got a response) and an error describing why the
// attempt is considered a failure (non-2xx status or transport error).
func deliverWebhook(callbackURL string, bodyBytes []byte) (int, error) {
	req, err := http.NewRequest(http.MethodPost, callbackURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return 0, err
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
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= http.StatusBadRequest {
		return resp.StatusCode, fmt.Errorf("received status %d", resp.StatusCode)
	}
	return resp.StatusCode, nil
}

// logWebhookAttempt persists one delivery attempt. Best-effort: a logging
// failure never affects retry behavior.
func logWebhookAttempt(interview model.Interview, attempt, statusCode int, deliveryErr error) {
	entry := model.WebhookLog{
		InterviewID: interview.ID,
		PartnerID:   interview.PartnerID,
		Event:       "interview.completed",
		URL:         interview.CallbackURL,
		Attempt:     attempt,
		StatusCode:  statusCode,
		Success:     deliveryErr == nil,
	}
	if deliveryErr != nil {
		entry.Error = deliveryErr.Error()
	}
	if err := scale.App.DB().Create(&entry).Error; err != nil {
		logger.Errorf("completion webhook: log attempt for interview %d: %v", interview.ID, err)
	}
}
