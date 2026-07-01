# Interview API — Partner Integration Guide

Embed a complete AI interview in **your** product with three moves:

1. **POST** — your backend creates an interview and gets back a `redirect_url`.
2. **Redirect** — you send your user's browser to that URL. They take the
   interview on our platform with **no login** (the link is the credential).
3. **GET** — when it's done, your backend pulls the **report** (scores + a written
   evaluation) with your API key.

That's the whole integration. Everything below is detail.

---

## 1. Access model

| Concept | What it is |
|---------|-----------|
| **Partner** | You — one external app integrating with us. |
| **API key** | Your server-side bearer secret (`sk_live_…`). Used for the POST and the GET. **Never ships to the browser.** |
| **Launch token** | A one-time, ~10-minute encrypted token we put in the `redirect_url` (`?t=…`). It authorizes exactly one browser to take exactly one interview. |
| **Session token** | Minted automatically when the user lands, from the launch token. Scoped to that single interview, ~2h. This is what the browser uses — never your API key. |

Every interview you create is stamped with your partner id. You can only ever
read or act on **your own** interviews.

**Getting a key** (operator mints it for you, one-time secret):
```bash
export STAGE=develop TAG=app SECRET=local
go run ./cmd/partner -name "Acme Corp" -email dev@acme.com
# -> API key: sk_live_xxxxxxxx...   (store securely; shown once)
```

---

## 2. Authentication

- **Your backend → us** (POST create, GET report/status): send your key on every
  request:
  ```
  Authorization: Bearer sk_live_xxxxxxxx...
  ```
- **The user's browser → us**: nothing to do. The `redirect_url` carries the
  launch token; we exchange it for a scoped session token automatically.

| Situation | Response |
|-----------|----------|
| Missing key (on a key-protected endpoint) | `401 {"error":"Unauthorized"}` |
| Unknown / inactive / expired key | `401 {"error":"Invalid API key"}` |
| Reading someone else's interview | `404 {"error":"interview not found"}` |

`GET /health` and `POST /api/v1/session/exchange` are the only endpoints that
don't take your API key.

---

## 3. Base URLs

| Piece | Local value |
|-------|-------------|
| API base (your backend calls this) | `http://127.0.0.1:8113` |
| Candidate app (where users are redirected) | `http://localhost:3000` |

---

## 4. The three calls

### 4.1 POST — create the interview

`POST /api/v1/interviews`  (alias: `POST /api/v1/create`) · **your API key**

```jsonc
{
  "topic": "Senior Go Engineer — concurrency & systems",  // required
  "candidate_name":  "Asha Rao",                            // optional
  "candidate_email": "asha@acme.com",                       // optional
  "external_id":     "acme-user-9981",                      // optional: YOUR ref
  "redirect_url":    "https://acme.com/interviews/done",    // optional: return-to
  "callback_url":    "https://acme.com/hooks/interview"     // optional: webhook
}
```

Response `201`:
```jsonc
{
  "id": 1234,
  "topic": "Senior Go Engineer — concurrency & systems",
  "status": "in_progress",
  "external_id": "acme-user-9981",
  "redirect_url": "http://localhost:3000/interview/1234?t=<launch-token>"
}
```

Take `redirect_url` and send the user's browser there (302 redirect, link, or
`window.location`). If you passed a `redirect_url` in the request, that's where we
send the candidate **back** when they finish.

### 4.2 Redirect — the user takes the interview

No work for you. On landing we validate the launch token (one-time, unexpired,
belongs to you), mint a session token scoped to that interview, and run the
voice/text/coding interview. When it ends we return the candidate to your
`redirect_url` (or show an on-platform summary if you didn't set one).

### 4.3 GET — pull the report

`GET /api/v1/interviews/{id}/report`  · **your API key**

Returns `400 {"error":"interview not completed yet"}` until the interview is done,
then a cached report:
```jsonc
{
  "interview_id": 1234,
  "overall_score": 7.42,
  "communication_score": 8.1,
  "technical_score": 7.0,
  "coding_score": 6.8,
  "behavioral_score": 7.9,
  "consistency_score": 8.0,
  "confidence_calibration_score": 7.5,
  "strengths":  "[\"...\"]",
  "weaknesses": "[\"...\"]",
  "improvement_plan": "Week 1: ..."
}
```

**Knowing when it's ready — two options:**
- **Poll** `GET /api/v1/interviews/{id}` for `"status": "completed"`, then GET the report.
- **Webhook** — pass `callback_url` at create time; we POST a signed
  `interview.completed` event when it finishes (see §6).

---

## 5. Full endpoint reference

All under `/api/v1`. "Key" = your API key. "Session" = automatic browser token.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/interviews` · `/create` | Key | Create interview → `redirect_url`. |
| `GET`  | `/interviews` | Key | List your interviews. |
| `GET`  | `/interviews/{id}` | Key/Session | One interview (status, score, phase). |
| `POST` | `/session/exchange` | launch token | Browser trades `?t=` for a session token. |
| `GET`  | `/interviews/{id}/report` | Key/Session | Recruiter report (after completion). |
| `GET`  | `/interviews/{id}/transcript` | Key/Session | Full Q&A transcript. |
| `GET`  | `/interviews/{id}/evaluation` | Key/Session | Aggregated metrics. |
| `PATCH`| `/interviews/{id}/complete` | Session | Mark complete, compute final score. |
| `GET`/`POST` | `/question`, `/answer`, `/skip`, `/hint`, `/tts`, `/interviews/{id}/coding-problem`, `/interviews/{id}/code` | Session | The in-interview loop (driven by our candidate app). |

You normally only call the **bold three** (`POST /interviews`, `GET …/report`,
optionally `GET /interviews/{id}`). The rest is driven by our candidate app using
the session token.

---

## 6. Completion webhook (optional)

If you set `callback_url` at create time, we POST when the interview completes:

```http
POST {callback_url}
X-Webhook-Event: interview.completed
X-Webhook-Signature: sha256=<hmac of body, key=WEBHOOK_SECRET>

{ "event":"interview.completed", "interview_id":1234, "status":"completed",
  "score":7.42, "external_id":"acme-user-9981", "completed_at":"2026-07-01T..." }
```

Verify the signature (HMAC-SHA256 of the raw body with the shared `WEBHOOK_SECRET`)
before trusting it, then call `GET …/report`.

---

## 7. Operator configuration (our side)

Environment on the interview service:

| Env | Meaning |
|-----|---------|
| `INTERVIEW_APP_URL` | Candidate app origin used to build `redirect_url` (e.g. `http://localhost:3000`). |
| `INTERVIEW_HANDOFF_SECRET` | Secret that encrypts/decrypts launch tokens. **Required** for the redirect flow. |
| `WEBHOOK_SECRET` | HMAC key for the completion webhook. |
| `REQUIRE_API_KEY` | `true` (default) enforces API keys; `false` only for local first-party dev. |

---

## 8. Errors

JSON: `{"status": <code>, "error": "<message>"}`.

| Code | Meaning |
|------|---------|
| `200`/`201` | Success. |
| `400` | Bad input, bad/expired launch token, or report requested before completion. |
| `401` | Auth failure / expired session. |
| `404` | Not found or not yours. |
| `409` | Launch token already used. |
| `500` | Server / upstream error. |

---

## 9. Testing

`api.http` (repo root) and `postman/` have the three-call flow pre-wired — set
your `apiKey` and run Create → open the `redirect_url` in a browser → Get Report.
