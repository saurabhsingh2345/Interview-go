package main

import "github.com/eskeon/scale/scale"

func HealthHandler(r *scale.Request) scale.Response {
	return scale.JsonResponse(map[string]any{
		"name":   Name,
		"stage":  r.Application.Stage,
		"status": "ok",
	})
}
