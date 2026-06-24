package handles

import (
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/eskeon/scale/scale"
)

type ttsRequestBody struct {
	Text string `json:"text" binding:"required"`
}

func GenerateTTS(r *scale.Request) scale.Response {
	payload := scale.Parse[ttsRequestBody](r)
	text := strings.TrimSpace(payload.Text)
	if text == "" {
		panic(scale.BadRequestError("text is required"))
	}

	id := time.Now().UnixNano()
	aiffPath := fmt.Sprintf("/tmp/tts_%d.aiff", id)
	wavPath := fmt.Sprintf("/tmp/tts_%d.wav", id)
	defer os.Remove(aiffPath)
	defer os.Remove(wavPath)

	// macOS built-in TTS — no API key, no network call
	if err := exec.Command("say", "-v", "Samantha", "-r", "170", "-o", aiffPath, text).Run(); err != nil {
		panic(scale.InternalServerError("say command failed", err))
	}

	// Convert AIFF → WAV for browser playback
	if err := exec.Command("afconvert", aiffPath, wavPath, "-d", "LEI16", "-f", "WAVE").Run(); err != nil {
		panic(scale.InternalServerError("afconvert failed", err))
	}

	audio, err := os.ReadFile(wavPath)
	if err != nil {
		panic(scale.InternalServerError("failed to read wav", err))
	}

	return scale.JsonResponse(map[string]any{
		"audio": base64.StdEncoding.EncodeToString(audio),
	})
}
