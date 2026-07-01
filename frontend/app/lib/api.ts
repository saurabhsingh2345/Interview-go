const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8113/api/v1";
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

// Session token minted by exchanging the redirect launch token (?t=). When set,
// it is the browser's credential and takes precedence over any build-time API key
// — so the partner's API key never has to ship in the bundle. Persisted per tab
// so a page refresh mid-interview keeps working.
const SESSION_STORAGE_KEY = "enfeca_session_token";
let sessionToken = "";

function loadStoredSessionToken(): string {
  if (sessionToken) return sessionToken;
  if (typeof window !== "undefined") {
    sessionToken = window.sessionStorage.getItem(SESSION_STORAGE_KEY) || "";
  }
  return sessionToken;
}

export function setSessionToken(token: string) {
  sessionToken = token;
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, token);
  }
}

export function clearSessionToken() {
  sessionToken = "";
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function bearerToken(): string {
  return loadStoredSessionToken() || API_KEY;
}

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const token = bearerToken();
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const config: RequestInit = {
    ...options,
    headers: isFormData
      ? { ...authHeader, ...(options.headers as Record<string, string>) }
      : {
          "Content-Type": "application/json",
          ...authHeader,
          ...(options.headers as Record<string, string>),
        },
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const errorData = await res.json();
      message = errorData.message || errorData.error || message;
    } catch {
      // ignore parse error
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
}

// ── Session handoff (redirect login-bypass) ──

export interface ExchangeSessionResponse {
  session_token: string;
  expires_at: number;
  interview: {
    id: number;
    topic: string;
    status: string;
    current_phase: string;
    score: number;
    redirect_url: string;
  };
  candidate: { name: string; email: string };
}

// exchangeSession trades the one-time launch token (?t=) for a session token,
// stores it, and returns the interview + candidate context. Unauthenticated call.
export async function exchangeSession(
  launchToken: string
): Promise<ExchangeSessionResponse> {
  const data = await request<ExchangeSessionResponse>("/session/exchange", {
    method: "POST",
    body: JSON.stringify({ token: launchToken }),
  });
  setSessionToken(data.session_token);
  return data;
}

// ── Interview Endpoints ──

export interface Interview {
  id: number;
  topic: string;
  status: string;
  score: number;
}

export interface CreateInterviewResponse {
  message: string;
  id: number;
  topic: string;
  status: number;
}

export function createInterview(topic: string) {
  return request<CreateInterviewResponse>("/create", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

export function listInterviews() {
  return request<Interview[]>("/interviews");
}

export function getInterview() {
  return request<Interview[]>(`/interviews/all`);
}

// ── Question Endpoints ──

export interface QuestionResponse {
  question: string;
  question_number: number;
  difficulty: string;
}

export function generateQuestion(interviewId: number) {
  return request<QuestionResponse>(`/interviews/${interviewId}`, {
    method: "POST",
  });
}

// ── Response Submission ──

export interface SubmitResponse {
  response_id: number;
  question: string;
  transcript: string;
  score: number;
  correctness: number;
  clarity: number;
  depth: number;
  confidence: number;
  feedback: string;
  suggested_answer: string;
}

export function submitResponse(interviewId: number, transcript: string) {
  return request<SubmitResponse>(`/interviews/${interviewId}/responses`, {
    method: "POST",
    body: JSON.stringify({ transcript }),
  });
}

// ── Follow-up ──

export interface FollowUpResponse {
  followup_question: string;
  question_number: number;
  parent_response_id: number;
  reasoning: string;
  concept_tested: string;
  difficulty: string;
}

export function generateFollowUp(interviewId: number) {
  return request<FollowUpResponse>(`/interviews/${interviewId}/followup`, {
    method: "POST",
  });
}

// ── Interview Responses ──

export interface EvaluationData {
  id: number;
  response_id: number;
  correctness: number;
  clarity: number;
  depth: number;
  confidence: number;
  ai_feedback: string;
  suggested_answer: string;
}

export interface FollowUpContext {
  id: number;
  response_id: number;
  reasoning: string;
  difficulty: string;
  concept_tested: string;
}

export interface InterviewResponseItem {
  id: number;
  question_number: number;
  question: string;
  answer: string;
  score: number;
  is_follow_up: boolean;
  parent_id?: number;
  evaluation?: EvaluationData;
  follow_up_context?: FollowUpContext;
  follow_ups: InterviewResponseItem[];
}

export interface InterviewResponsesData {
  responses: InterviewResponseItem[];
  count: number;
}

export function getInterviewResponses(interviewId: number) {
  return request<InterviewResponsesData>(
    `/interviews/${interviewId}/responses`
  );
}

// ── Complete Interview ──

export interface CompleteInterviewResponse {
  id: number;
  topic: string;
  status: string;
  score: number;
  responses: unknown[];
}

export function completeInterview(interviewId: number) {
  return request<CompleteInterviewResponse>(
    `/interviews/${interviewId}/complete`,
    { method: "PATCH" }
  );
}

// ── Evaluation ──

export interface InterviewEvaluation {
  interview_id: number;
  topic: string;
  status: string;
  final_score: number;
  metrics: {
    correctness: number;
    clarity: number;
    depth: number;
    confidence: number;
  };
  total_questions: number;
}

export function getInterviewEvaluation(interviewId: number) {
  return request<InterviewEvaluation>(`/interviews/${interviewId}/evaluation`);
}

// ── Per-Response Evaluation ──

export interface ResponseEvaluation {
  response_id: number;
  question: string;
  answer: string;
  score: number;
  evaluation: {
    correctness: number;
    clarity: number;
    depth: number;
    confidence: number;
    feedback: string;
    suggested: string;
  };
  follow_up_context?: FollowUpContext;
}

export function getResponseEvaluation(responseId: number) {
  return request<ResponseEvaluation>(`/responses/${responseId}/evaluation`);
}

// ── Voice Loop ──

export interface VoiceTurnResponse {
  text: string;
  question_id: number;
  follow_up: boolean;
  follow_up_count: number;
  score?: number;
  transcript?: string;
  completed: boolean;
  final_score?: number;
  current_phase?: string;
  skill_estimate?: number;
  difficulty?: string;
}

// ── Report ──

export interface InterviewReport {
  id: number;
  interview_id: number;
  overall_score: number;
  communication_score: number;
  technical_score: number;
  coding_score: number;
  behavioral_score: number;
  consistency_score: number;
  confidence_calibration_score: number;
  strengths: string;
  weaknesses: string;
  improvement_plan: string;
}

export function getInterviewReport(interviewId: number) {
  return request<InterviewReport>(`/interviews/${interviewId}/report`);
}

// ── Transcript ──

export interface TranscriptEntry {
  id: number;
  question_num: number;
  phase: string;
  difficulty: string;
  is_follow_up: boolean;
  question: string;
  answer: string;
  score: number;
  evaluation?: EvaluationData & {
    expressed_confidence?: number;
    star_situation?: number;
    star_task?: number;
    star_action?: number;
    star_result?: number;
  };
}

export interface TranscriptData {
  interview_id: number;
  transcript: TranscriptEntry[];
  count: number;
}

export function getInterviewTranscript(interviewId: number) {
  return request<TranscriptData>(`/interviews/${interviewId}/transcript`);
}

// ── Coding round ──

export interface CodingProblem {
  problem_statement: string;
  examples: { input: string; output: string; explanation: string }[];
  constraints: string[];
  hints: string[];
  expected_time_complexity: string;
  expected_space_complexity: string;
  tags: string[];
}

export interface CodingProblemResponse {
  response_id: number;
  problem: CodingProblem;
}

export function getCodingProblem(interviewId: number) {
  return request<CodingProblemResponse>(`/interviews/${interviewId}/coding-problem`);
}

export interface CodeSubmissionResult {
  response_id: number;
  evaluation_id: number;
  correctness: number;
  time_complexity: string;
  space_complexity: string;
  code_quality: number;
  has_bugs: boolean;
  bug_description: string;
  optimization_possible: boolean;
  follow_up_question: string;
  completed: boolean;
  current_phase: string;
}

export function submitCode(
  interviewId: number,
  responseId: number,
  language: string,
  code: string,
  timeTakenSeconds?: number
) {
  return request<CodeSubmissionResult>(`/interviews/${interviewId}/code`, {
    method: "POST",
    body: JSON.stringify({
      response_id: responseId,
      language,
      code,
      time_taken_seconds: timeTakenSeconds ?? 0,
    }),
  });
}

export function skipQuestion(interviewId: number, questionId: number) {
  return request<VoiceTurnResponse>("/skip", {
    method: "POST",
    body: JSON.stringify({ interview_id: interviewId, question_id: questionId }),
  });
}

export function requestHint(interviewId: number, questionId: number) {
  return request<VoiceTurnResponse>("/hint", {
    method: "POST",
    body: JSON.stringify({ interview_id: interviewId, question_id: questionId }),
  });
}

export function requestAIVoiceQuestion(interviewId: number) {
  const query = new URLSearchParams({ interview_id: String(interviewId) });
  return request<VoiceTurnResponse>(`/question?${query.toString()}`);
}

export function submitAIVoiceAnswer(
  interviewId: number,
  questionId: number,
  audioBlob: Blob,
  filename = "answer.webm"
) {
  const formData = new FormData();
  formData.append("interview_id", String(interviewId));
  formData.append("question_id", String(questionId));
  formData.append("audio", audioBlob, filename);

  return request<VoiceTurnResponse>("/answer", {
    method: "POST",
    body: formData,
  });
}
