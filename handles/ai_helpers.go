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
	"github.com/eskeon/scale/scale/logger"
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

func (r *questionGenerationResult) UnmarshalJSON(data []byte) error {
	var alias struct {
		Question   string          `json:"question"`
		Difficulty json.RawMessage `json:"difficulty"`
	}
	if err := json.Unmarshal(data, &alias); err != nil {
		return err
	}
	r.Question = alias.Question
	r.Difficulty = jsonRawToString(alias.Difficulty)
	return nil
}

type evaluationResult struct {
	Correctness         int     `json:"correctness"`
	Clarity             int     `json:"clarity"`
	Depth               int     `json:"depth"`
	Confidence          int     `json:"confidence"`
	Feedback            string  `json:"feedback"`
	SuggestedAnswer     string  `json:"suggested_answer"`
	ExpressedConfidence float64 `json:"expressed_confidence"`
	// STAR fields (behavioral phase only)
	STARSituation float64 `json:"star_situation"`
	STARTask      float64 `json:"star_task"`
	STARAction    float64 `json:"star_action"`
	STARResult    float64 `json:"star_result"`
	// System design fields (system_design phase only)
	SDScalability   float64 `json:"sd_scalability"`
	SDComponents    float64 `json:"sd_components"`
	SDTradeoffs     float64 `json:"sd_tradeoffs"`
	SDCommunication float64 `json:"sd_communication"`
}

type followUpGenerationResult struct {
	Question        string `json:"question"`
	Reasoning       string `json:"reasoning"`
	ConceptTested   string `json:"concept_tested"`
	Difficulty      string `json:"difficulty"`
	SelectedBranch  string `json:"selected_branch"`
	BranchReasoning string `json:"branch_reasoning"`
}

func (r *followUpGenerationResult) UnmarshalJSON(data []byte) error {
	var alias struct {
		Question        string          `json:"question"`
		Reasoning       string          `json:"reasoning"`
		ConceptTested   string          `json:"concept_tested"`
		Difficulty      json.RawMessage `json:"difficulty"`
		SelectedBranch  string          `json:"selected_branch"`
		BranchReasoning string          `json:"branch_reasoning"`
	}
	if err := json.Unmarshal(data, &alias); err != nil {
		return err
	}
	r.Question = alias.Question
	r.Reasoning = alias.Reasoning
	r.ConceptTested = alias.ConceptTested
	r.Difficulty = jsonRawToString(alias.Difficulty)
	r.SelectedBranch = alias.SelectedBranch
	r.BranchReasoning = alias.BranchReasoning
	return nil
}

// jsonRawToString decodes a json.RawMessage that may be a JSON string or number.
func jsonRawToString(raw json.RawMessage) string {
	if len(raw) == 0 {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return strings.Trim(strings.TrimSpace(string(raw)), `"`)
}

type codingProblemResult struct {
	ProblemStatement        string                   `json:"problem_statement"`
	Examples                []map[string]interface{} `json:"examples"`
	Constraints             []string                 `json:"constraints"`
	Hints                   []string                 `json:"hints"`
	ExpectedTimeComplexity  string                   `json:"expected_time_complexity"`
	ExpectedSpaceComplexity string                   `json:"expected_space_complexity"`
	Tags                    []string                 `json:"tags"`
}

type hintGenerationResult struct {
	HintText        string `json:"hint_text"`
	SimplerQuestion string `json:"simpler_question"`
}

func generateHintAndSimplify(interview *model.Interview, current *model.Response) (hint string, simpler string, err error) {
	messages := []groqMessage{
		{
			Role:    "system",
			Content: "You are a helpful technical interview coach. Respond with JSON only.",
		},
		{
			Role: "user",
			Content: fmt.Sprintf(`The candidate is struggling with this interview question about "%s":
"%s"

Generate:
1. hint_text: A one-sentence subtle hint that nudges them toward the answer without giving it away.
2. simpler_question: A simpler version of the question that tests the same core concept but is easier to answer.

Respond with JSON only: {"hint_text": "...", "simpler_question": "..."}`, interview.Topic, current.Question),
		},
	}
	var result hintGenerationResult
	if err = callGroqJSON(messages, &result); err != nil {
		return "", "", err
	}
	return result.HintText, result.SimplerQuestion, nil
}

type codeEvaluationResult struct {
	Correctness          int    `json:"correctness"`
	TimeComplexity       string `json:"time_complexity"`
	SpaceComplexity      string `json:"space_complexity"`
	CodeQuality          int    `json:"code_quality"`
	HasBugs              bool   `json:"has_bugs"`
	BugDescription       string `json:"bug_description"`
	OptimizationPossible bool   `json:"optimization_possible"`
	FollowUpQuestion     string `json:"follow_up_question"`
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

func callGroqJSON(messages []groqMessage, target any, maxTokens ...int) error {
	apiKey, baseURL := mustGroqConfig()

	tokens := 800
	if len(maxTokens) > 0 && maxTokens[0] > 0 {
		tokens = maxTokens[0]
	}

	payload := groqRequest{
		Model:          groqModel(),
		Messages:       messages,
		ResponseFormat: map[string]string{"type": "json_object"},
		Temperature:    0.7,
		MaxTokens:      tokens,
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

// callGroqText is a text (non-JSON) completion — used for session summaries.
func callGroqText(messages []groqMessage, maxTokens int) (string, error) {
	apiKey, baseURL := mustGroqConfig()

	payload := groqRequest{
		Model:       groqModel(),
		Messages:    messages,
		Temperature: 0.4,
		MaxTokens:   maxTokens,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, baseURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

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
		return "", fmt.Errorf("groq api error (%d): %s", resp.StatusCode, string(respBody))
	}

	var parsed groqResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", err
	}
	if parsed.Error != nil {
		return "", fmt.Errorf("groq api error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return "", fmt.Errorf("groq api returned no content")
	}
	return strings.TrimSpace(parsed.Choices[0].Message.Content), nil
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

// ─── Phase-aware system prompt ────────────────────────────────────────────────

var phaseSystemInstructions = map[string]string{
	PhaseIntroduction:  "Focus on the candidate's background, recent projects, and communication style. Be warm and conversational. Do not probe technical depth yet.",
	PhaseFundamentals:  "Test core concepts relevant to the topic. Match the stated difficulty. Do not ask about system architecture yet.",
	PhaseDeepTechnical: "Probe internals, edge cases, and depth of understanding. Challenge the candidate. Ask why, not just what. Expect precise answers.",
	PhaseCoding:        "You are conducting the live coding round. Present a practical coding problem. Do not ask verbal questions; ask the candidate to solve code.",
	PhaseBehavioral:    "Use the STAR framework. Ask about specific past situations. If an answer is vague, probe: What was your exact role? What was the outcome? What would you do differently?",
	PhaseSystemDesign:  "Engage in open-ended discussion. Respond to what the candidate proposes and go deeper. Explore trade-offs, scalability, and failure modes.",
	PhaseWrapUp:        "Ask reflective and forward-looking questions. Keep it brief and positive. Wrap up the session gracefully.",
}

// buildInterviewerSystemPrompt injects session context + phase instructions.
func buildInterviewerSystemPrompt(ctx PhaseContext, sessionSummary string) string {
	instruction := phaseSystemInstructions[ctx.Phase]
	if instruction == "" {
		instruction = "Ask relevant interview questions appropriate to the context."
	}
	phaseLabel := strings.ReplaceAll(ctx.Phase, "_", " ")
	base := fmt.Sprintf(
		"You are a senior technical interviewer conducting the %s phase of a %s-level interview. "+
			"Candidate skill estimate: %.1f/10. Questions must be %s difficulty. %s",
		phaseLabel, ctx.CandidateLevel, ctx.SkillEstimate, ctx.Difficulty, instruction,
	)
	if strings.TrimSpace(sessionSummary) == "" {
		return base
	}
	return "Session context:\n" + sessionSummary + "\n\n" + base
}

// ─── Session memory ───────────────────────────────────────────────────────────

// generateSessionSummary makes a best-effort 7-line summary; returns the old
// summary on failure so existing context is never lost.
func generateSessionSummary(interview *model.Interview, responses []*model.Response) string {
	if len(responses) == 0 {
		return interview.SessionSummary
	}

	// Take the last 5 answered responses
	var pairs []string
	for i := len(responses) - 1; i >= 0 && len(pairs) < 5; i-- {
		r := responses[i]
		if r != nil && strings.TrimSpace(r.Answer) != "" {
			pairs = append([]string{fmt.Sprintf("Q: %s\nA: %s\nScore: %d", r.Question, r.Answer, r.Score)}, pairs...)
		}
	}
	if len(pairs) == 0 {
		return interview.SessionSummary
	}

	level := interview.CandidateLevel
	if level == "" {
		level = CandidateLevelIntermediate
	}

	userPrompt := fmt.Sprintf(
		"Interview topic: %s. Phase: %s. Skill estimate: %.1f/10. Candidate level: %s.\n"+
			"Last Q&A pairs:\n%s\n\n"+
			"Produce a structured summary in EXACTLY this format (no extra text):\n"+
			"- Candidate level: ...\n"+
			"- Current phase: ...\n"+
			"- Skill estimate: .../10\n"+
			"- Topics covered: ...\n"+
			"- Notable strengths: ...\n"+
			"- Notable gaps: ...\n"+
			"- Key observation: ...",
		interview.Topic,
		interview.CurrentPhase,
		interview.SkillEstimate,
		level,
		strings.Join(pairs, "\n---\n"),
	)

	summary, err := callGroqText([]groqMessage{
		{Role: "system", Content: "You are an AI interview assistant. Summarize the interview session state in 5–7 lines maximum. No JSON, plain text only."},
		{Role: "user", Content: userPrompt},
	}, 300)
	if err != nil {
		logger.Errorf("session summary failed for interview %d: %v", interview.ID, err)
		return interview.SessionSummary
	}
	return summary
}

// ─── Question generation ──────────────────────────────────────────────────────

func generateNextQuestion(interview *model.Interview, responses []*model.Response, ctx PhaseContext) (*questionGenerationResult, error) {
	if ctx.Phase == PhaseCoding {
		return generateCodingQuestion(interview, ctx)
	}

	context := buildResponseContext(responses)
	userPrompt := fmt.Sprintf(
		"Generate the next interview question for topic %q.\n"+
			"If there are no previous responses, start at the stated difficulty.\n"+
			"If there is history, continue naturally without repeating previous questions.\n"+
			"Return JSON with keys question and difficulty.\n"+
			"Conversation context:\n%s",
		interview.Topic, context,
	)

	var result questionGenerationResult
	err := callGroqJSON([]groqMessage{
		{
			Role: "system",
			Content: buildInterviewerSystemPrompt(ctx, interview.SessionSummary) +
				" Respond only as JSON with keys question and difficulty. Keep the question concise and suitable for spoken delivery.",
		},
		{Role: "user", Content: userPrompt},
	}, &result)
	if err != nil {
		return nil, err
	}

	result.Question = strings.TrimSpace(result.Question)
	result.Difficulty = normalizeDifficulty(result.Difficulty, ctx.Difficulty)
	if result.Question == "" {
		return nil, fmt.Errorf("groq returned an empty question")
	}
	return &result, nil
}

func generateCodingQuestion(interview *model.Interview, ctx PhaseContext) (*questionGenerationResult, error) {
	userPrompt := fmt.Sprintf(
		"Generate a coding problem for a %s level %s engineer interviewing for %s.\n"+
			"Return JSON with EXACTLY these keys: problem_statement, examples (array of {input,output,explanation}), "+
			"constraints (string array), hints (string array), expected_time_complexity, expected_space_complexity, tags (string array).",
		ctx.Difficulty, ctx.CandidateLevel, interview.Topic,
	)

	var problem codingProblemResult
	err := callGroqJSON([]groqMessage{
		{Role: "system", Content: "You are a senior engineer creating coding interview problems. Return only valid JSON."},
		{Role: "user", Content: userPrompt},
	}, &problem)
	if err != nil {
		return nil, err
	}

	stmt := strings.TrimSpace(problem.ProblemStatement)
	if stmt == "" {
		return nil, fmt.Errorf("groq returned an empty problem statement")
	}

	return &questionGenerationResult{
		Question:   stmt,
		Difficulty: ctx.Difficulty,
	}, nil
}

// GenerateCodingProblemFull returns the full problem JSON for storing in ResponseMetadata.
func GenerateCodingProblemFull(interview *model.Interview, ctx PhaseContext) (*codingProblemResult, error) {
	userPrompt := fmt.Sprintf(
		"Generate a coding problem for a %s level %s engineer interviewing for %s.\n"+
			"Return JSON with EXACTLY these keys: problem_statement, examples (array of {input,output,explanation}), "+
			"constraints (string array), hints (string array), expected_time_complexity, expected_space_complexity, tags (string array).",
		ctx.Difficulty, ctx.CandidateLevel, interview.Topic,
	)

	var problem codingProblemResult
	err := callGroqJSON([]groqMessage{
		{Role: "system", Content: "You are a senior engineer creating coding interview problems. Return only valid JSON."},
		{Role: "user", Content: userPrompt},
	}, &problem)
	if err != nil {
		return nil, err
	}
	return &problem, nil
}

// ─── Evaluation ───────────────────────────────────────────────────────────────

func evaluateInterviewAnswer(interview *model.Interview, response *model.Response, transcript string, ctx PhaseContext) (*evaluationResult, error) {
	basePrompt := fmt.Sprintf(
		"Evaluate this interview answer.\nTopic: %s\nQuestion: %s\nAnswer: %s\n",
		interview.Topic, response.Question, transcript,
	)

	var returnFields string
	switch ctx.Phase {
	case PhaseBehavioral:
		returnFields = `Also evaluate using the STAR framework:
- star_situation (1-10): Did they describe a clear, specific situation?
- star_task (1-10): Did they explain their specific responsibility?
- star_action (1-10): Did they describe concrete actions they personally took?
- star_result (1-10): Did they quantify or clearly state the outcome?
Also estimate expressed_confidence (1-10 float): how confident did they sound?
Return JSON: correctness, clarity, depth, confidence, feedback, suggested_answer, expressed_confidence, star_situation, star_task, star_action, star_result.
All scores 0-10 integers except expressed_confidence (float).`

	case PhaseSystemDesign:
		returnFields = `Also evaluate system design dimensions:
- sd_scalability (1-10): Did they consider scale, load, distributed concerns?
- sd_components (1-10): Do they know the relevant components (DBs, queues, caches, APIs)?
- sd_tradeoffs (1-10): Did they acknowledge trade-offs in their choices?
- sd_communication (1-10): Could they explain the design clearly?
Also estimate expressed_confidence (1-10 float).
Return JSON: correctness, clarity, depth, confidence, feedback, suggested_answer, expressed_confidence, sd_scalability, sd_components, sd_tradeoffs, sd_communication.
All scores 0-10 integers except expressed_confidence (float).`

	default:
		returnFields = `Also estimate expressed_confidence (1-10 float): how confident did they sound?
Return JSON: correctness, clarity, depth, confidence, feedback, suggested_answer, expressed_confidence.
All scores 0-10 integers except expressed_confidence (float).`
	}

	userPrompt := basePrompt + returnFields

	var result evaluationResult
	err := callGroqJSON([]groqMessage{
		{
			Role: "system",
			Content: buildInterviewerSystemPrompt(ctx, interview.SessionSummary) +
				" You are evaluating a candidate's answer. Respond only as JSON. Keep feedback constructive and suggested_answer practical.",
		},
		{Role: "user", Content: userPrompt},
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
	if result.ExpressedConfidence < 0 {
		result.ExpressedConfidence = 0
	}
	if result.ExpressedConfidence > 10 {
		result.ExpressedConfidence = 10
	}
	return &result, nil
}

// ─── Follow-up generation ─────────────────────────────────────────────────────

func generateFollowUp(interview *model.Interview, latest *model.Response, responses []*model.Response, ctx PhaseContext, latestEval *evaluationResult) (*followUpGenerationResult, error) {
	context := buildResponseContext(responses)

	// STAR-guided branching for behavioral phase
	starHint := ""
	if ctx.Phase == PhaseBehavioral && latestEval != nil {
		weakest := "result"
		weakestScore := latestEval.STARResult
		if latestEval.STARSituation < weakestScore {
			weakest = "situation"
			weakestScore = latestEval.STARSituation
		}
		if latestEval.STARTask < weakestScore {
			weakest = "task"
			weakestScore = latestEval.STARTask
		}
		if latestEval.STARAction < weakestScore {
			weakest = "action"
		}
		if weakestScore < 5 {
			starHint = fmt.Sprintf("\nWeak STAR component detected: %s (score %.1f/10). Your follow-up MUST probe this component.", weakest, weakestScore)
		}
	}

	userPrompt := fmt.Sprintf(
		"Generate one follow-up interview question.\n"+
			"Topic: %s\nLatest question: %s\nLatest answer: %s\nConversation context:\n%s\n"+
			"Return JSON with keys: question, reasoning, concept_tested, difficulty, selected_branch, branch_reasoning.\n"+
			"Difficulty must be easy or medium.",
		interview.Topic, latest.Question, latest.Answer, context,
	)

	branchInstructions := `
Generate 4 possible follow-up directions then self-select the best:
A) Definition validation — did the candidate truly understand the concept or just recall it?
B) Real-world application — can they apply it to an actual project or scenario?
C) Performance and edge cases — do they know the limits, failure modes, or complexity?
D) Internal implementation — do they know how it works under the hood?
Evaluate the candidate's answer and select the branch that reveals the most signal about their actual depth.
Set selected_branch to the letter (A/B/C/D) and branch_reasoning to why you chose it.` + starHint

	var result followUpGenerationResult
	err := callGroqJSON([]groqMessage{
		{
			Role: "system",
			Content: buildInterviewerSystemPrompt(ctx, interview.SessionSummary) +
				" You are generating a targeted follow-up question. Respond only as JSON with keys: question, reasoning, concept_tested, difficulty, selected_branch, branch_reasoning." +
				branchInstructions,
		},
		{Role: "user", Content: userPrompt},
	}, &result)
	if err != nil {
		return nil, err
	}

	result.Question = strings.TrimSpace(result.Question)
	result.Reasoning = strings.TrimSpace(result.Reasoning)
	result.ConceptTested = strings.TrimSpace(result.ConceptTested)
	result.Difficulty = normalizeDifficulty(result.Difficulty, "medium")
	result.SelectedBranch = strings.ToUpper(strings.TrimSpace(result.SelectedBranch))
	result.BranchReasoning = strings.TrimSpace(result.BranchReasoning)

	if result.Question == "" {
		return nil, fmt.Errorf("groq returned an empty follow-up question")
	}
	return &result, nil
}

// ─── Code evaluation ──────────────────────────────────────────────────────────

func evaluateCode(problemStatement, language, code string) (*codeEvaluationResult, error) {
	userPrompt := fmt.Sprintf(
		"Problem: %s\n\nCandidate's solution (%s):\n%s\n\n"+
			"Return JSON with EXACTLY these fields: correctness (1-10), time_complexity (string), "+
			"space_complexity (string), code_quality (1-10), has_bugs (bool), bug_description (string), "+
			"optimization_possible (bool), follow_up_question (string).",
		problemStatement, language, code,
	)

	var result codeEvaluationResult
	err := callGroqJSON([]groqMessage{
		{Role: "system", Content: "You are a senior engineer doing a code review in a technical interview. Be precise and technical. Respond only as JSON."},
		{Role: "user", Content: userPrompt},
	}, &result)
	if err != nil {
		return nil, err
	}

	result.Correctness = clampScore(result.Correctness)
	result.CodeQuality = clampScore(result.CodeQuality)
	return &result, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
			"Q%d[%s]: %s | Answer: %s | Score: %d | FollowUp: %t",
			response.QuestionNum,
			emptyFallback(response.Phase, "?"),
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
