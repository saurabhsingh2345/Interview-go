# Scale usage (backend)

This note lists how the backend uses the Scale library in this repo.

## Application setup

- Application creation and boot: `scale.NewApplication`, `app.SetDsn`, `app.Bind`, `scale.Cli` ([main.go](main.go#L1-L33)).
- Configuration loading via Scale config helpers: `config.IniConfig` and typed config structs ([main.go](main.go#L1-L33), [settings/settings.go](settings/settings.go#L1-L20)).
- Logger usage: `logger.Infof`, `logger.Errorf` ([main.go](main.go#L1-L33), [handles/interviews.go](handles/interviews.go#L1-L206), [handles/voice_loop.go](handles/voice_loop.go#L1-L258)).

## Routing and service binding

- Route registration through the Scale application: `app.Get`, `app.Post`, `app.Patch` ([service.go](service.go#L1-L44)).
- Service hooks: `CronScheduler`, `Heartbeat`, `GrpcAuthentication` with Scale types `Application`, `CronBuilder` ([service.go](service.go#L1-L23)).

## Request/response helpers

- Request context type: `*scale.Request` used by all handlers ([health.go](health.go#L1-L9), [handles/interviews.go](handles/interviews.go#L1-L420), [handles/voice_loop.go](handles/voice_loop.go#L1-L305)).
- Query/route params: `r.Param("id").Int64()` ([handles/interviews.go](handles/interviews.go#L43-L201)).
- JSON responses: `scale.JsonResponse`, `scale.JsonResponseCreated`, `scale.JsonResponseWithCode` ([health.go](health.go#L1-L9), [handles/interviews.go](handles/interviews.go#L1-L420), [handles/voice_loop.go](handles/voice_loop.go#L1-L305)).
- Collection mapping: `scale.MapResponse` ([handles/interviews.go](handles/interviews.go#L34-L48)).
- Payload parsing: `scale.Parse[T]` for JSON bodies ([handles/interviews.go](handles/interviews.go#L15-L25), [handles/voice_loop.go](handles/voice_loop.go#L29-L42)).

## Data access (DAO/ORM helpers)

- Repository access: `scale.WR[T](r)` to get a DAO bound to the request context ([handles/interviews.go](handles/interviews.go#L19-L209), [handles/voice_loop.go](handles/voice_loop.go#L47-L230)).
- DAO type usage: `*scale.DAO[T]` for helpers and shared logic ([handles/voice_loop.go](handles/voice_loop.go#L260-L305)).
- Model registration: `app.RegisterModel` with Scale models ([service.go](service.go#L17-L27)).
- Model base type: `scale.BaseModel` embedded in all DB models ([model/interview.go](model/interview.go#L1-L52)).

## Error handling

- Standardized errors for HTTP responses: `scale.BadRequestError`, `scale.NotFoundError`, `scale.InternalServerError` ([handles/interviews.go](handles/interviews.go#L60-L205), [handles/voice_loop.go](handles/voice_loop.go#L43-L205), [handles/ai_helpers.go](handles/ai_helpers.go#L40-L120)).

## Config types

- Application config types from Scale: `config.AppConfig`, `config.RedisConfig`, `config.SpacesConfig` ([settings/settings.go](settings/settings.go#L1-L20)).
