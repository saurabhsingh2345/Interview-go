package handles

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go-app/model"
	"go-app/settings"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/eskeon/scale/scale"
)

const (
	defaultGroqModel        = "llama-3.3-70b-versatile"
	defaultGroqChatURL      = "https://api.groq.com/openai/v1/chat/completions"
	defaultGroqWhisperURL   = "https://api.groq.com/openai/v1/audio/transcriptions"
	defaultGroqWhisperModel = "whisper-large-v3"
	upstreamTimeout         = 45 * time.Second
	maxInterviewContextSize = 10
)

type groqMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type groqRequest struct {
	Model          string            `json:"model"`
	Messages       []groqMessage     `json:"messages"`
	ResponseFormat map[string]string `json:"response_format,omitempty"`
	Temperature    float64           `json:"temperature,omitempty"`
	MaxTokens      int               `json:"max_tokens,omitempty"`
}

type groqResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type groqTranscriptionResponse struct {
	Text  string `json:"text"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

type questionGenerationResult struct {
	Question   string `json:"question"`
	Difficulty string `json:"difficulty"`
}

type evaluationResult struct {
	Correctness     int    `json:"correctness"`
	Clarity         int    `json:"clarity"`
	Depth           int    `json:"depth"`
	Confidence      int    `json:"confidence"`
	Feedback        string `json:"feedback"`
	SuggestedAnswer string `json:"suggested_answer"`
}

type followUpGenerationResult struct {
	Question      string `json:"question"`
	Reasoning     string `json:"reasoning"`
	ConceptTested string `json:"concept_tested"`
	Difficulty    string `json:"difficulty"`
}

var apiHTTPClient = &http.Client{Timeout: upstreamTimeout}

func mustGroqConfig() (string, string) {
	cfg := settings.Config.Groq
	apiKey := strings.TrimSpace(cfg.APIKey)
	if apiKey == "" {
		panic(scale.InternalServerError("groq api key is not configured"))
	}

	baseURL := strings.TrimSpace(cfg.BaseURL)
	if baseURL == "" {
		baseURL = defaultGroqChatURL
	}

	return apiKey, baseURL
}

func mustGroqAPIKey() string {
	apiKey := strings.TrimSpace(settings.Config.Groq.APIKey)
	if apiKey == "" {
		panic(scale.InternalServerError("groq api key is not configured"))
	}

	return apiKey
}

func groqModel() string {
	modelID := strings.TrimSpace(settings.Config.Groq.Model)
	if modelID == "" {
		return defaultGroqModel
	}
	return modelID
}


func callGroqJSON(messages []groqMessage, target any) error {
	apiKey, baseURL := mustGroqConfig()

	payload := groqRequest{
		Model:    groqModel(),
		Messages: messages,
		ResponseFormat: map[string]string{
			"type": "json_object",
		},
		Temperature: 0.7,
		MaxTokens:   800,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL, bytes.NewReader(body))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := apiHTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	if resp.StatusCode >= http.StatusBadRequest {
		return fmt.Errorf("groq api error (%d): %s", resp.StatusCode, string(respBody))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return err
	}

	if parsed.Error != nil {
		return fmt.Errorf("groq api error: %s", parsed.Error.Message)
	}

	if len(parsed.Choices) == 0 || strings.TrimSpace(parsed.Choices[0].Message.Content) == "" {
		return fmt.Errorf("groq api returned no content")
	}

	cleanContent := cleanJSON(parsed.Choices[0].Message.Content)
	if err := json.Unmarshal([]byte(cleanContent), target); err != nil {
		return fmt.Errorf("failed to parse groq json output: %w", err)
	}

	return nil
}

func cleanJSON(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		s = strings.TrimPrefix(s, "```json")
		s = strings.TrimPrefix(s, "```")
		s = strings.TrimSuffix(s, "```")
	}
	return strings.TrimSpace(s)
}


func transcribeAudio(filename string, audio []byte, contentType string) (string, error) {
	apiKey := mustGroqAPIKey()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)

	fileWriter, err := writer.CreateFormFile("file", filename)
	if err != nil {
		return "", err
	}

	if _, err := fileWriter.Write(audio); err != nil {
		return "", err
	}

	if err := writer.WriteField("model", defaultGroqWhisperModel); err != nil {
		return "", err
	}

	if err := writer.WriteField("language", "en"); err != nil {
		return "", err
	}

	if err := writer.Close(); err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, defaultGroqWhisperURL, &body)
	if err != nil {
		return "", err
	}

	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", writer.FormDataContentType())
	if strings.TrimSpace(contentType) != "" {
		req.Header.Set("Accept", "application/json")
	}

	resp, err := apiHTTPClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode >= http.StatusBadRequest {
		return "", fmt.Errorf("groq whisper api error (%d): %s", resp.StatusCode, string(respBody))
	}

	var parsed groqTranscriptionResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}

	if parsed.Error != nil {
		return "", fmt.Errorf("groq whisper api error: %s", parsed.Error.Message)
	}

	text := strings.TrimSpace(parsed.Text)
	if text == "" {
		return "", fmt.Errorf("groq whisper returned an empty transcript")
	}

	return text, nil
}

func generateNextQuestion(interview *model.Interview, responses []*model.Response) (*questionGenerationResult, error) {
	context := buildResponseContext(responses)

	userPrompt := fmt.Sprintf(
		"Generate the next interview question for topic %q.\n"+
			"If there are no previous responses, ask a beginner-level question.\n"+
			"If there is history, ask the next logical question and increase difficulty gradually.\n"+
			"Return JSON with keys question and difficulty.\n"+
			"Conversation context:\n%s",
		interview.Topic,
		context,
	)

	var result questionGenerationResult
	err := callGroqJSON([]groqMessage{
		{
			Role: "system",
			Content: "You are an expert technical interviewer. Respond only as JSON with keys question and difficulty. " +
				"Keep the question concise, topic-relevant, and suitable for spoken delivery. " +
				"Ensure variety in your questions—do not always ask the same introductory questions for the same topic.",
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}, &result)
	if err != nil {
		return nil, err
	}

	result.Question = strings.TrimSpace(result.Question)
	result.Difficulty = normalizeDifficulty(result.Difficulty, "easy")
	if result.Question == "" {
		return nil, fmt.Errorf("groq returned an empty question")
	}

	return &result, nil
}

func evaluateInterviewAnswer(interview *model.Interview, response *model.Response, transcript string) (*evaluationResult, error) {
	userPrompt := fmt.Sprintf(
		"Evaluate this interview answer and return JSON.\n"+
			"Topic: %s\nQuestion: %s\nAnswer: %s\n"+
			"Return keys correctness, clarity, depth, confidence, feedback, suggested_answer.\n"+
			"Scores must be integers from 0 to 10.",
		interview.Topic,
		response.Question,
		transcript,
	)

	var result evaluationResult
	err := callGroqJSON([]groqMessage{
		{
			Role: "system",
			Content: "You are a fair interview evaluator. Respond only as JSON. " +
				"Keep feedback constructive and suggested_answer practical.",
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}, &result)
	if err != nil {
		return nil, err
	}

	result.Correctness = clampScore(result.Correctness)
	result.Clarity = clampScore(result.Clarity)
	result.Depth = clampScore(result.Depth)
	result.Confidence = clampScore(result.Confidence)
	result.Feedback = strings.TrimSpace(result.Feedback)
	result.SuggestedAnswer = strings.TrimSpace(result.SuggestedAnswer)

	return &result, nil
}

func generateFollowUp(interview *model.Interview, latest *model.Response, responses []*model.Response) (*followUpGenerationResult, error) {
	context := buildResponseContext(responses)

	userPrompt := fmt.Sprintf(
		"Generate one follow-up interview question.\n"+
			"Topic: %s\n"+
			"Latest question: %s\n"+
			"Latest answer: %s\n"+
			"Conversation context:\n%s\n"+
			"Return JSON with keys question, reasoning, concept_tested, difficulty.\n"+
			"Difficulty must be easy or medium.",
		interview.Topic,
		latest.Question,
		latest.Answer,
		context,
	)

	var result followUpGenerationResult
	err := callGroqJSON([]groqMessage{
		{
			Role: "system",
			Content: "You are an interviewer generating focused follow-up questions. " +
				"Respond only as JSON with keys: question, reasoning, concept_tested, difficulty. " +
				"Your goal is to follow up on the candidate's last answer. Probe for details, ask for clarification on ambiguous points, or test the depth of their knowledge based specifically on what they just said. " +
				"Do NOT ask a completely new or unrelated question. Be creative and varied in your approach.",
		},
		{
			Role:    "user",
			Content: userPrompt,
		},
	}, &result)
	if err != nil {
		return nil, err
	}

	result.Question = strings.TrimSpace(result.Question)
	result.Reasoning = strings.TrimSpace(result.Reasoning)
	result.ConceptTested = strings.TrimSpace(result.ConceptTested)
	result.Difficulty = normalizeDifficulty(result.Difficulty, "medium")

	if result.Question == "" {
		return nil, fmt.Errorf("groq returned an empty follow-up question")
	}

	return &result, nil
}

func buildResponseContext(responses []*model.Response) string {
	if len(responses) == 0 {
		return "No previous responses."
	}

	start := 0
	if len(responses) > maxInterviewContextSize {
		start = len(responses) - maxInterviewContextSize
	}

	var lines []string
	for _, response := range responses[start:] {
		line := fmt.Sprintf(
			"Q%d: %s | Answer: %s | Score: %d | FollowUp: %t",
			response.QuestionNum,
			emptyFallback(response.Question, "(missing question)"),
			emptyFallback(response.Answer, "(not answered yet)"),
			response.Score,
			response.IsFollowUp,
		)
		lines = append(lines, line)
	}

	return strings.Join(lines, "\n")
}

func averageEvaluationScore(result *evaluationResult) int {
	total := result.Correctness + result.Clarity + result.Depth + result.Confidence
	return int(float64(total)/4.0 + 0.5)
}

func normalizeDifficulty(value string, fallback string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "easy":
		return "easy"
	case "medium":
		return "medium"
	case "hard":
		return "hard"
	default:
		return fallback
	}
}

func clampScore(value int) int {
	if value < 0 {
		return 0
	}
	if value > 10 {
		return 10
	}
	return value
}

func emptyFallback(value string, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
