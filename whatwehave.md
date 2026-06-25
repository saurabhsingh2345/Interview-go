# What We Have

## Project Summary
A full-stack AI interview simulation platform. The backend is Go using the `eskeon/scale` framework; the frontend is Next.js 16 / React 19. The platform runs structured multi-phase interviews, generates AI-driven questions, captures voice or text answers, evaluates them with an LLM, and produces recruiter and candidate reports.

---

## What the App Does
- Creates interview sessions from a topic, with optional course-context linking (`program_id`, `session_id`, `practice_id`).
- Runs a 7-phase structured interview: introduction → fundamentals → deep technical → coding → behavioral → system design (senior only) → wrap-up.
- Tracks a per-session skill estimate (ELO-style) and adapts question difficulty dynamically.
- Generates phase-aware questions, follow-ups, hints, and coding problems via Groq LLM.
- Captures answers by voice (Whisper transcription) or text.
- Evaluates answers with phase-specific scoring: STAR framework for behavioral, system design dimensions, expressed-confidence calibration.
- Maintains a rolling session summary passed to the LLM as context.
- Produces per-response evaluations and interview-level metric aggregations.
- Generates a recruiter report (multi-dimensional scores + LLM narrative) and a candidate self-report (transcript + improvement plan).
- Supports live step-through replay of completed sessions.

---

## Backend

### Entry points
- `main.go` — loads config from `develop.ini`/environment, sets up the Scale application.
- `service.go` — registers all models and HTTP routes.
- `health.go` — `GET /health` liveness check.

### Models (`model/`)
- `Interview` — topic, status, score, current phase, phase question count, candidate level, skill estimate, session summary, and optional course-link IDs.
- `Response` — question text, answer text, score, feedback, follow-up flag, parent ID, phase, difficulty, and JSON metadata (used for coding problem storage).
- `Evaluation` — correctness, clarity, depth, confidence, AI feedback, suggested answer, expressed confidence, STAR scores (situation/task/action/result), system design scores (scalability/components/tradeoffs/communication), and code review fields (time/space complexity, bugs, optimisation).
- `FollowUpContext` — reasoning, difficulty, concept tested, selected branch (A/B/C/D), branch reasoning.
- `InterviewReport` — overall, communication, technical, coding, behavioral, consistency, and confidence-calibration scores plus LLM-generated strengths, weaknesses, and improvement plan.

### Phases (`handles/phase.go`)
Seven sequential phases with configurable max question counts. Transitions happen automatically when the count for a phase is exhausted. Skill estimate adjusts ±0.5 per answer based on score thresholds. Difficulty derives from the skill estimate.

| Phase | Max questions |
|---|---|
| introduction | 3 |
| fundamentals | 4 |
| deep_technical | 4 |
| coding | 2 |
| behavioral | 3 |
| system_design (senior) | 3 |
| wrap_up | 2 |

### API Endpoints (`service.go`)

**Interview lifecycle**
- `POST /api/v1/create` — create interview session.
- `GET /api/v1/interviews` — list interviews (supports `?practice_id=` filter).
- `GET /api/v1/interviews/all` — alias for list.
- `POST /api/v1/interviews/{id}` — generate next question (text flow).
- `POST /api/v1/interviews/{id}/responses` — submit answer (text flow).
- `GET /api/v1/interviews/{id}/responses` — get all responses, tree-structured with follow-ups nested under parents.
- `POST /api/v1/interviews/{id}/followup` — generate a follow-up question (text flow).
- `PATCH /api/v1/interviews/{id}/complete` — mark completed, compute final score.
- `GET /api/v1/interviews/{id}/evaluation` — aggregated metrics for a completed interview.
- `GET /api/v1/responses/{id}/evaluation` — evaluation for a single response (404 if none).

**Voice loop**
- `GET /api/v1/question?interview_id=` — get or generate the next question; returns existing pending question if one is already unanswered (idempotent).
- `POST /api/v1/answer` — submit audio, transcribe via Whisper, evaluate, decide follow-up or advance phase, return next question.
- `POST /api/v1/skip` — mark current question skipped (score=5), advance to next.
- `POST /api/v1/hint` — generate a hint + simplified version of the current question.
- `POST /api/v1/ai/question` and `POST /api/v1/ai/answer` — alternate voice endpoints (same logic).

**Coding round**
- `GET /api/v1/interviews/{id}/coding-problem` — return the structured coding problem for the active coding-phase response (generates and caches on first call).
- `POST /api/v1/interviews/{id}/code` — evaluate submitted code (correctness, complexity, bugs, quality), store result, advance phase.

**Reports and transcript**
- `GET /api/v1/interviews/{id}/report` — recruiter report (generated on demand, cached after first call).
- `GET /api/v1/interviews/{id}/transcript` — full ordered transcript with evaluations.

**Utilities**
- `POST /api/v1/tts` — text-to-speech proxy.

### AI Integration (`handles/ai_helpers.go`)
- All LLM calls go to Groq (`llama-3.3-70b-versatile` by default, configurable).
- `callGroqJSON` — structured JSON completion used for question generation, evaluation, follow-up, and report narrative.
- `callGroqText` — plain text completion used for session summary.
- `transcribeAudio` — Whisper large-v3 via Groq for audio transcription.
- Phase-specific system prompts inject current phase label, candidate level, skill estimate, difficulty, and rolling session summary.
- Follow-up generation self-selects from 4 branches (definition validation / real-world application / edge cases / internal implementation), with STAR-guided probing for behavioral phase.
- Session summary is regenerated after each main-question answer (best-effort, fallback to previous on error).

### Database migrations (`migration/sql/`)
Six incremental SQL migrations tracked in the `migration/` runner:
1. `001_fix_score_type.sql`
2. `002_session_memory.sql`
3. `003_followup_branches.sql`
4. `004_evaluation_scores.sql`
5. `005_coding_round.sql`
6. `006_course_link.sql`

---

## Frontend (`frontend/`)

### Pages
| Route | File | Purpose |
|---|---|---|
| `/` | `app/page.tsx` | Dashboard: create interview, view recent sessions, KPI stats |
| `/interviews` | `app/interviews/page.tsx` | Full interview library with topic search/filter |
| `/interview/[id]` | `app/interview/[id]/page.tsx` | Live voice interview: AI audio playback, recording, coding round (Monaco editor), phase progress |
| `/results/[id]` | `app/results/[id]/page.tsx` | Post-interview summary: score ring, metric bars, per-question breakdown |
| `/responses/[id]` | `app/responses/[id]/page.tsx` | Single-response deep-dive: scores, AI feedback, follow-up context |
| `/interviews/[id]/report` | `app/interviews/[id]/report/page.tsx` | Recruiter report: multi-dimensional score bars + narrative |
| `/interviews/[id]/candidate-report` | `app/interviews/[id]/candidate-report/page.tsx` | Candidate self-report: score overview, strengths/weaknesses, transcript by phase |
| `/interviews/[id]/replay` | `app/interviews/[id]/replay/page.tsx` | Step-through transcript replay with evaluation per question |
| `/settings` | `app/settings/` | Workspace settings |

### Key libraries (`app/lib/`)
- `api.ts` — typed fetch wrapper for all backend endpoints; throws `ApiError` on non-2xx.
- `useAudioPlayer.ts` — TTS audio playback hook with prewarm support.
- `useVoiceRecorder.ts` — MediaRecorder-based recording hook with silence detection.
- `useSpeechRecognition.ts` — Web Speech API hook.

### Interview page features
- Word-by-word animated question reveal while AI speaks.
- Coding phase: Monaco editor with language selector, problem/examples/constraints/hints panels, live code submission.
- Follow-up counter (max 3 per root question).
- Skip, Hint, and End Interview controls.
- Phase progress indicator in sidebar.

---

## Tech Stack
- **Backend**: Go, Scale framework (`eskeon/scale`), GORM, PostgreSQL (port 5433), Groq AI (LLM + Whisper).
- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS v4, Monaco Editor, `@base-ui/react`.
- **Config**: `develop.ini` / `develop.ini.enc` with stage-based secrets. Groq API key, model, and base URL are configurable.

---

## Known Behaviors
- `/question` is idempotent: calling it multiple times without answering returns the same pending question rather than creating duplicates.
- `GET /api/v1/interviews/{id}/evaluation` returns zero metrics (not an error) when a completed interview has no evaluations.
- `GET /api/v1/responses/{id}/evaluation` returns 404 when no evaluation exists for that response.
- `InterviewReport` is generated once and cached; subsequent calls to `/report` return the stored record.
- System design phase is only inserted for `senior`-level candidates.
- The `history` route (`/history`) is a legacy alias — all navigation uses `/interviews`.
