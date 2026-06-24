# What We Have

## Project Summary
This repository is a full-stack interview simulation platform.
The backend is written in Go using the `eskeon/scale` framework, while the frontend is a React/Next.js application.
The core idea is to create interview sessions from a topic, generate AI-driven interview questions, capture answers, score them, and optionally handle voice-based interactions.

## What the App Does
- Creates interview sessions with a chosen topic.
- Generates follow-up and next questions automatically using AI.
- Records candidate answers and evaluates them.
- Supports both text-based interview flows and voice-driven interview turns.
- Tracks interview progress and final scoring.
- Provides summary and evaluation data for completed interviews.

## Backend Overview
### Entry points
- `main.go`: Loads config from `.develop.ini`/environment, sets up the application, and runs the Scale CLI.
- `service.go`: Registers models and HTTP endpoints.
- `health.go`: Simple health check endpoint.

### Models
Defined in `model/interview.go`:
- `Interview`: stores topic, status, score, and related responses.
- `Response`: stores AI questions, human answers, scores, feedback, follow-up flags, and parent relationships.
- `Evaluation`: stores correctness, clarity, depth, confidence, AI feedback, and suggested answer.
- `FollowUpContext`: stores follow-up reasoning, difficulty, and concept tested.

### API Endpoints
Implemented in `handles/interviews.go` and `handles/voice_loop.go`:
- `POST /api/v1/create`: create a new interview session.
- `GET /api/v1/interviews`: list interviews.
- `GET /api/v1/interviews/all`: fetch interviews with details.
- `POST /api/v1/interviews/{id}`: generate the next interview question.
- `POST /api/v1/interviews/{id}/responses`: submit an answer for a question.
- `POST /api/v1/interviews/{id}/followup`: generate a follow-up question.
- `PATCH /api/v1/interviews/{id}/complete`: mark an interview completed and compute the final score.
- `GET /api/v1/interviews/{id}/responses`: retrieve all responses for an interview.
- `GET /api/v1/interviews/{id}/evaluation`: retrieve interview-level evaluation metrics.
- `GET /api/v1/responses/{id}/evaluation`: retrieve evaluation for a single response.
- `POST /api/v1/ai/question` and `POST /api/v1/ai/answer`: voice interview question/answer flow.
- `GET /api/v1/question` and `POST /api/v1/answer`: alternate voice endpoints.
- `POST /api/v1/tts`: text-to-speech endpoint.

### AI and Voice Integration
- `handles/ai_helpers.go`: calls Groq APIs for chat completions and Whisper transcription.
- Generates question text, follow-up prompts, and answer evaluations via AI.
- Handles audio uploads, transcription, and transcribed answer evaluation.
- Uses `groq` model configuration and environment-backed API keys.

## Frontend Overview
### Main app behavior
- `frontend/app/page.tsx`: dashboard for creating interviews and reviewing sessions.
- `frontend/app/interview/[id]/page.tsx`: voice interview page that plays questions aloud, records audio, sends answers, and receives next prompts.
- `frontend/app/lib/api.ts`: client-side API wrapper for backend endpoints.

### User experience
- Dashboard to create a topic-driven interview session.
- Interview flow supports automatic speech playback and audio capture.
- Results pages surface completed interview scores and evaluation metrics.

## Tech Stack
- Backend: Go 1.26, Scale framework, GORM via `eskeon/scale`, PostgreSQL/MySQL drivers, Groq AI APIs.
- Frontend: Next.js, React, TypeScript, client-side voice recording and speech playback.

## Current Strengths
- Strong interview session model with question/answer/evaluation lifecycle.
- AI-driven question generation and response evaluation.
- Voice-first interaction mode with speech transcription.
- Clear separation between interview creation, running, and review.

## Notes
- Environment config is managed via `.develop.ini`, `develop.ini.enc`, and stage-specific secrets.
- Groq API integration depends on configured `APIKey` and optional custom `BaseURL`.
- The project is built for both text and audio interview interactions.
