const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8113/api/v1";

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
  const config: RequestInit = {
    headers: isFormData
      ? options.headers
      : {
          "Content-Type": "application/json",
          ...options.headers,
        },
    ...options,
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

// ── Interview Endpoints ──

export interface Interview {
  id: number;
  topic: string;
  status: string;
  score: string;
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
  score: string;
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
  final_score: string;
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
  final_score?: string;
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
