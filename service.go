package main

import (
	"context"
	"go-app/handles"
	"go-app/model"

	"github.com/eskeon/scale/scale"
)

type Service struct{}

func (s *Service) CronScheduler(app *scale.Application, b *scale.CronBuilder) error {
	return nil
}

func (s *Service) Heartbeat(app *scale.Application) {}

func (s *Service) GrpcAuthentication(app *scale.Application, ctx context.Context) error {
	return nil
}

func (s *Service) Bind(app *scale.Application) {

	// Model
	app.RegisterModel(&model.Partner{})
	app.RegisterModel(&model.APIKey{})
	app.RegisterModel(&model.InterviewSession{})
	app.RegisterModel(&model.Interview{})
	app.RegisterModel(&model.Response{})
	app.RegisterModel(&model.Evaluation{})
	app.RegisterModel(&model.FollowUpContext{})
	app.RegisterModel(&model.InterviewReport{})
	app.RegisterModel(&model.WebhookLog{})

	// Third-party API authentication (Bearer API keys).
	app.RegisterMiddleware(handles.APIKeyAuth)

	// health end point
	app.Get("/health", HealthHandler)

	// Redirect handoff: exchange a one-time launch token for a browser session
	// token. Unauthenticated — the launch token itself is the credential.
	app.Post("/api/v1/session/exchange", handles.ExchangeSession)

	// API
	app.Post("/api/v1/create", handles.CreateInterview)
	// Partner-facing alias for create (clearer name in integration docs).
	app.Post("/api/v1/interviews", handles.CreateInterview)
	app.Get("/api/v1/interviews", handles.ListInterviews)
	app.Get("/api/v1/interviews/all", handles.GetInterview)
	app.Get("/api/v1/interviews/{id}", handles.GetInterviewByID)
	app.Post("/api/v1/interviews/{id}", handles.GenerateInterviewQuestion)
	app.Post("/api/v1/interviews/{id}/responses", handles.SubmitInterviewResponse)
	app.Get("/api/v1/interviews/{id}/responses", handles.GetInterviewResponses)
	app.Post("/api/v1/interviews/{id}/followup", handles.GenerateInterviewFollowUp)
	app.Patch("/api/v1/interviews/{id}/complete", handles.CompleteInterview)
	app.Get("/api/v1/interviews/{id}/evaluation", handles.GetInterviewEvaluation)
	app.Get("/api/v1/responses/{id}/evaluation", handles.GetResponseEvaluation)
	app.Post("/api/v1/ai/question", handles.GenerateAIVoiceQuestion)
	app.Post("/api/v1/ai/answer", handles.SubmitAIVoiceAnswer)
	app.Get("/api/v1/question", handles.GenerateAIVoiceQuestion)
	app.Post("/api/v1/answer", handles.SubmitAIVoiceAnswer)
	app.Post("/api/v1/tts", handles.GenerateTTS)
	app.Post("/api/v1/skip", handles.SkipQuestion)
	app.Post("/api/v1/hint", handles.HintQuestion)

	// Report endpoints (Step 4)
	app.Get("/api/v1/interviews/{id}/report", handles.GetInterviewReport)
	app.Get("/api/v1/interviews/{id}/transcript", handles.GetInterviewTranscript)

	// Coding round endpoints (Step 5)
	app.Post("/api/v1/interviews/{id}/code", handles.SubmitCode)
	app.Get("/api/v1/interviews/{id}/coding-problem", handles.GetCodingProblem)

}
