"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
  requestAIVoiceQuestion,
  submitAIVoiceAnswer,
  skipQuestion,
  requestHint,
  completeInterview,
  VoiceTurnResponse,
  getCodingProblem,
  submitCode,
  CodingProblem,
  CodeSubmissionResult,
} from "../../lib/api";
import { useAudioPlayer } from "../../lib/useAudioPlayer";
import { useVoiceRecorder } from "../../lib/useVoiceRecorder";
import { showToast } from "../../components/Toast";
import { Badge, Card, MetricBar, PageHeader, SubtleCard } from "../../components/ui";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <textarea className="w-full h-64 font-mono text-sm p-3 border rounded" placeholder="Loading editor..." />,
});

const MAX_FOLLOW_UPS = 3;
const COMPLETION_SPEECH = "Interview over.";
const LANGUAGES = ["javascript", "typescript", "python", "java", "go", "cpp"] as const;
type Language = typeof LANGUAGES[number];
type UIPhase = "booting" | "playing" | "listening" | "processing" | "coding" | "code_feedback" | "complete";

function AIAvatar({ speaking }: { speaking: boolean }) {
  return (
    <div className="relative flex items-center justify-center w-24 h-24">
      {speaking && (
        <>
          <span className="absolute inline-flex h-24 w-24 rounded-full bg-blue-400 opacity-20 animate-ping" />
          <span className="absolute inline-flex h-20 w-20 rounded-full bg-blue-400 opacity-25 animate-pulse" />
        </>
      )}
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-base font-bold text-white shadow-lg">
        AI
      </div>
    </div>
  );
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = Number(params.id);

  const [phase, setPhase] = useState<UIPhase>("booting");
  const [question, setQuestion] = useState("");
  const [currentApiPhase, setCurrentApiPhase] = useState("");
  const [mainQuestionCount, setMainQuestionCount] = useState(0);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [completedScore, setCompletedScore] = useState<number | null>(null);
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [displayedWordIdx, setDisplayedWordIdx] = useState(0);

  // Coding state
  const [codingProblem, setCodingProblem] = useState<CodingProblem | null>(null);
  const [codingResponseId, setCodingResponseId] = useState(0);
  const [codeLanguage, setCodeLanguage] = useState<Language>("javascript");
  const [codeValue, setCodeValue] = useState("");
  const [codeResult, setCodeResult] = useState<CodeSubmissionResult | null>(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [startTime, setStartTime] = useState(0);

  const [started, setStarted] = useState(false);
  const initializedRef = useRef(false);
  const questionIdRef = useRef(0);
  const lastTurnCompletedRef = useRef(false);
  const playPromptRef = useRef<(turn: VoiceTurnResponse, countAsMain: boolean) => Promise<void>>(async () => {});

  const { isPlaying, playAudio, stopAudio, prewarm } = useAudioPlayer();

  const questionWords = useMemo(() => question.split(" ").filter(Boolean), [question]);

  // Word-by-word reveal when AI is speaking
  useEffect(() => {
    if (phase !== "playing" || !question) {
      setDisplayedWordIdx(questionWords.length);
      return;
    }
    setDisplayedWordIdx(0);
    let idx = 0;
    const id = setInterval(() => {
      idx++;
      setDisplayedWordIdx(idx);
      if (idx >= questionWords.length) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, question]);

  // ── Coding round helpers ─────────────────────────────────────────────────────

  const enterCodingMode = useCallback(async (turn: VoiceTurnResponse) => {
    setPhase("coding");
    setQuestion(turn.text);
    questionIdRef.current = turn.question_id;
    lastTurnCompletedRef.current = turn.completed;
    setCurrentApiPhase(turn.current_phase ?? "coding");
    setCodeValue("");
    setCodeResult(null);
    setStartTime(Date.now());
    try {
      const { response_id, problem } = await getCodingProblem(interviewId);
      setCodingResponseId(response_id);
      setCodingProblem(problem);
    } catch {
      showToast("Failed to load coding problem", "error");
      setCodingProblem({ problem_statement: turn.text, examples: [], constraints: [], hints: [], expected_time_complexity: "", expected_space_complexity: "", tags: [] });
    }
  }, [interviewId]);

  const handleCodeSubmit = useCallback(async () => {
    if (!codeValue.trim() || codeSubmitting) return;
    setCodeSubmitting(true);
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    try {
      const result = await submitCode(interviewId, codingResponseId || questionIdRef.current, codeLanguage, codeValue, elapsed);
      setCodeResult(result);
      setLastScore(result.correctness);
      setPhase("code_feedback");
      if (result.completed) lastTurnCompletedRef.current = true;
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Code submission failed", "error");
    } finally {
      setCodeSubmitting(false);
    }
  }, [codeValue, codeSubmitting, interviewId, codingResponseId, codeLanguage, startTime]);

  const handleCodingContinue = useCallback(async () => {
    if (lastTurnCompletedRef.current) {
      setPhase("complete");
      setCompletedScore(null);
      await playAudio(COMPLETION_SPEECH, { onEnded: () => router.push(`/results/${interviewId}`) });
      return;
    }
    setPhase("processing");
    try {
      const turn = await requestAIVoiceQuestion(interviewId);
      await playPromptRef.current(turn, !turn.follow_up && !turn.completed);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to continue", "error");
      setPhase("listening");
    }
  }, [interviewId, playAudio, router]);

  // ── Voice round helpers ──────────────────────────────────────────────────────

  const submitRecordedAnswer = useCallback(async (blob: Blob, filename: string) => {
    if (!questionIdRef.current) return;
    if (lastTurnCompletedRef.current) {
      setPhase("complete");
      setQuestion(COMPLETION_SPEECH);
      await playAudio(COMPLETION_SPEECH);
      return;
    }
    setPhase("processing");
    try {
      const nextTurn = await submitAIVoiceAnswer(interviewId, questionIdRef.current, blob, filename);
      await playPromptRef.current(nextTurn, !nextTurn.follow_up && !nextTurn.completed);
    } catch (error) {
      setPhase("listening");
      showToast(error instanceof Error ? error.message : "Failed to process the recorded answer", "error");
    }
  }, [interviewId, playAudio]);

  // High silenceMs = manual stop only (user clicks "Stop Speaking")
  const { error: recordingError, isRecording, startRecording, stopRecording } = useVoiceRecorder({
    silenceMs: 600000,
    maxDurationMs: 0,
    onRecordingComplete: submitRecordedAnswer,
  });

  const playPrompt = useCallback(async (turn: VoiceTurnResponse, countAsMain: boolean) => {
    stopRecording();
    setCurrentApiPhase(turn.current_phase ?? "");
    lastTurnCompletedRef.current = turn.completed;
    if (typeof turn.score === "number") setLastScore(turn.score);
    if (typeof turn.transcript === "string") setLastTranscript(turn.transcript);
    if (countAsMain) setMainQuestionCount((prev) => prev + 1);

    if (turn.completed) {
      setPhase("complete");
      setQuestion(COMPLETION_SPEECH);
      setCompletedScore(turn.final_score ?? null);
      const played = await playAudio(COMPLETION_SPEECH, {
        onEnded: () => router.push(`/results/${interviewId}`),
      });
      if (!played) window.setTimeout(() => router.push(`/results/${interviewId}`), 1500);
      return;
    }

    if (turn.current_phase === "coding") {
      await enterCodingMode(turn);
      return;
    }

    setQuestion(turn.text);
    questionIdRef.current = turn.question_id;
    setFollowUpCount(turn.follow_up_count || 0);
    setIsFollowUp(turn.follow_up);

    setPhase("playing");
    const played = await playAudio(turn.text, {
      onEnded: () => setPhase("listening"),
    });
    if (!played) setPhase("listening");
  }, [interviewId, playAudio, router, stopRecording, enterCodingMode]);

  useEffect(() => { playPromptRef.current = playPrompt; }, [playPrompt]);

  const handleStart = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setStarted(true);
    prewarm();
    void requestAIVoiceQuestion(interviewId)
      .then((turn) => playPrompt(turn, !turn.follow_up && !turn.completed))
      .catch((error: unknown) => {
        showToast(error instanceof Error ? error.message : "Failed to start the interview", "error");
      });
  }, [interviewId, playPrompt, prewarm]);

  const handleSkip = useCallback(async () => {
    stopAudio();
    stopRecording();
    setPhase("processing");
    try {
      const turn = await skipQuestion(interviewId, questionIdRef.current);
      await playPromptRef.current(turn, !turn.follow_up && !turn.completed);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to skip question", "error");
      setPhase("listening");
    }
  }, [interviewId, stopAudio, stopRecording]);

  const handleHint = useCallback(async () => {
    stopAudio();
    stopRecording();
    setPhase("processing");
    try {
      const turn = await requestHint(interviewId, questionIdRef.current);
      await playPromptRef.current(turn, false);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to get hint", "error");
      setPhase("listening");
    }
  }, [interviewId, stopAudio, stopRecording]);

  const handleEndInterview = useCallback(async () => {
    stopAudio();
    stopRecording();
    try {
      await completeInterview(interviewId);
    } catch {
      // ignore if already completed
    }
    router.push(`/results/${interviewId}`);
  }, [interviewId, stopAudio, stopRecording, router]);

  useEffect(() => {
    return () => { stopAudio(); stopRecording(); };
  }, [stopAudio, stopRecording]);

  useEffect(() => {
    if (recordingError) showToast(recordingError, "error");
  }, [recordingError]);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!started) {
    return (
      <div className="section-grid">
        <PageHeader eyebrow="Voice interview" title={`Interview #${interviewId}`}
          description="The AI will ask questions. You control when you speak." />
        <section className="details-grid">
          <Card className="p-8 sm:p-12 flex flex-col items-center gap-6 text-center">
            <AIAvatar speaking={false} />
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Ready to begin</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Click Start to begin. The AI will speak each question — press <strong>Start Speaking</strong> when you're ready to answer.
              </p>
            </div>
            <button onClick={handleStart} className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors">
              Start Interview
            </button>
          </Card>
        </section>
      </div>
    );
  }

  // Coding round UI
  if (phase === "coding" || phase === "code_feedback") {
    return (
      <div className="section-grid">
        <PageHeader eyebrow="Live coding round" title={`Interview #${interviewId}`}
          description="Solve the problem below. The AI will review your code." />
        <section className="details-grid">
          <div className="space-y-6">
            <Card className="p-6 sm:p-8">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Badge tone="primary">Coding phase</Badge>
                {codeResult ? <Badge tone="success">Submitted</Badge> : <Badge tone="warning">In progress</Badge>}
              </div>
              <h3 className="text-base font-semibold text-slate-950 mb-3">Problem statement</h3>
              <div className="rounded-[20px] bg-slate-50 p-5 text-sm leading-7 text-slate-800 whitespace-pre-wrap">
                {codingProblem?.problem_statement || question}
              </div>
              {codingProblem && codingProblem.examples.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-2">Examples</h4>
                  {codingProblem.examples.map((ex, i) => (
                    <div key={i} className="rounded-xl bg-slate-100 p-3 text-xs font-mono mb-2">
                      <div><span className="text-slate-500">Input:</span> {ex.input}</div>
                      <div><span className="text-slate-500">Output:</span> {ex.output}</div>
                      {ex.explanation && <div className="text-slate-500 mt-1">{ex.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-6 sm:p-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-slate-950">Your solution</h3>
                <select
                  value={codeLanguage}
                  onChange={(e) => setCodeLanguage(e.target.value as Language)}
                  disabled={phase === "code_feedback"}
                  className="text-sm border rounded-lg px-3 py-1.5 bg-white disabled:opacity-50"
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="rounded-xl overflow-hidden border">
                <MonacoEditor
                  height="350px"
                  language={codeLanguage === "cpp" ? "cpp" : codeLanguage}
                  value={codeValue}
                  onChange={(v) => setCodeValue(v ?? "")}
                  options={{ readOnly: phase === "code_feedback", fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false }}
                  theme="vs-light"
                />
              </div>
              {phase !== "code_feedback" && (
                <button
                  onClick={handleCodeSubmit}
                  disabled={codeSubmitting || !codeValue.trim()}
                  className="mt-4 rounded-2xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {codeSubmitting ? "Reviewing..." : "Submit Code"}
                </button>
              )}
            </Card>

            {codeResult && (
              <Card className="p-6 sm:p-8">
                <h3 className="text-base font-semibold text-slate-950 mb-4">AI Feedback</h3>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <MetricBar label="Correctness" value={codeResult.correctness} />
                  <MetricBar label="Code quality" value={codeResult.code_quality} />
                </div>
                <div className="space-y-2 text-sm text-slate-700">
                  <p><span className="font-semibold">Time complexity:</span> {codeResult.time_complexity || "N/A"}</p>
                  <p><span className="font-semibold">Space complexity:</span> {codeResult.space_complexity || "N/A"}</p>
                  {codeResult.has_bugs && <p className="text-rose-600"><span className="font-semibold">Bugs found:</span> {codeResult.bug_description}</p>}
                  {codeResult.optimization_possible && <p className="text-amber-600">Optimization opportunity detected.</p>}
                  {codeResult.follow_up_question && (
                    <SubtleCard className="mt-3 border-blue-100 bg-blue-50/70 p-4">
                      <p className="text-sm text-blue-900"><span className="font-semibold">Follow-up:</span> {codeResult.follow_up_question}</p>
                    </SubtleCard>
                  )}
                </div>
                <button
                  onClick={handleCodingContinue}
                  className="mt-5 rounded-2xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-colors"
                >
                  Continue →
                </button>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {codingProblem && codingProblem.constraints.length > 0 && (
              <Card className="p-6">
                <h2 className="text-base font-semibold text-slate-950 mb-3">Constraints</h2>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside">
                  {codingProblem.constraints.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </Card>
            )}
            {codingProblem && codingProblem.hints.length > 0 && (
              <Card className="p-6">
                <h2 className="text-base font-semibold text-slate-950 mb-3">Hints</h2>
                <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside">
                  {codingProblem.hints.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </Card>
            )}
          </div>
        </section>
      </div>
    );
  }

  // Voice round UI
  const progressPercent = `${Math.min((mainQuestionCount / Math.max(mainQuestionCount + 3, 5)) * 100, 95)}%`;
  const isSpeakingPhase = phase === "playing" || phase === "listening" || phase === "processing";

  const displayedText = phase === "playing"
    ? questionWords.slice(0, displayedWordIdx).join(" ")
    : question || "Preparing the first question...";

  return (
    <div className="section-grid">
      <PageHeader eyebrow="Voice interview" title={`Interview #${interviewId}`}
        description="Listen to each question, then press Start Speaking to respond." />
      <section className="details-grid">
        <div className="space-y-6">

          {/* Main question card */}
          <Card className="p-6 sm:p-8">
            {/* Status badges */}
            <div className="flex flex-wrap items-center gap-2">
              {currentApiPhase && <Badge tone="primary">{currentApiPhase.replace("_", " ")}</Badge>}
              {isFollowUp && <Badge tone="warning">Follow-up {followUpCount} of {MAX_FOLLOW_UPS}</Badge>}
              {phase === "playing" && <Badge tone="primary">AI speaking</Badge>}
              {phase === "listening" && !isRecording && <Badge tone="neutral">Waiting for you</Badge>}
              {isRecording && <Badge tone="danger">Recording</Badge>}
              {phase === "processing" && <Badge tone="warning">Processing...</Badge>}
              {phase === "complete" && <Badge tone="success">Complete</Badge>}
            </div>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="metric-track"><div className="metric-fill" style={{ width: progressPercent }} /></div>
            </div>

            {/* Avatar + question */}
            <div className="mt-8 rounded-[24px] bg-slate-50 p-8 flex flex-col items-center gap-6 text-center">
              <AIAvatar speaking={phase === "playing"} />
              <div className="w-full">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 mb-3">
                  {isFollowUp ? "Follow-up" : "Question"}
                </p>
                <p className="text-base font-semibold leading-7 text-slate-950 min-h-[3rem]">
                  {displayedText}
                  {phase === "playing" && displayedWordIdx < questionWords.length && (
                    <span className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle" />
                  )}
                </p>
              </div>
            </div>

            {/* Speaking controls */}
            {phase === "listening" && (
              <div className="mt-6 flex flex-col items-center gap-4">
                {!isRecording ? (
                  <button
                    onClick={() => void startRecording()}
                    className="rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-white hover:bg-emerald-700 active:bg-emerald-800 transition-colors shadow-sm"
                  >
                    Start Speaking
                  </button>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex items-center gap-2 text-sm text-rose-600 font-medium">
                      <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                      Recording in progress
                    </div>
                    <button
                      onClick={stopRecording}
                      className="rounded-2xl bg-rose-600 px-8 py-3 text-sm font-semibold text-white hover:bg-rose-700 active:bg-rose-800 transition-colors shadow-sm"
                    >
                      Stop Speaking
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Processing indicator */}
            {phase === "processing" && (
              <SubtleCard className="mt-6 border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm text-blue-900">Transcribing and evaluating your answer...</p>
              </SubtleCard>
            )}

            {/* Complete indicator */}
            {phase === "complete" && (
              <SubtleCard className="mt-6 border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm text-emerald-900">
                  Interview finished{completedScore != null ? ` — final score: ${completedScore.toFixed(2)}` : ""}. Redirecting to results.
                </p>
              </SubtleCard>
            )}

            {/* Skip / Hint / End Interview */}
            {isSpeakingPhase && phase !== "processing" && (
              <div className="mt-6 flex flex-wrap gap-3 justify-center">
                <button
                  onClick={() => void handleSkip()}
                  className="rounded-xl border border-slate-300 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Skip question
                </button>
                <button
                  onClick={() => void handleHint()}
                  className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  Hint
                </button>
                <button
                  onClick={() => void handleEndInterview()}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-5 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 transition-colors"
                >
                  End interview
                </button>
              </div>
            )}
          </Card>

          {/* Last answer */}
          {lastTranscript || lastScore !== null ? (
            <Card className="p-6 sm:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Last answer</h2>
                  <p className="mt-1 text-sm text-slate-500">Transcription of your previous response.</p>
                </div>
                {lastScore !== null && (
                  <div className="rounded-[24px] bg-slate-50 px-6 py-5 text-center shrink-0">
                    <div className="brand-wordmark text-4xl text-slate-950">{lastScore.toFixed(1)}</div>
                    <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Score</div>
                  </div>
                )}
              </div>
              <div className="mt-6 rounded-[24px] bg-slate-50 p-5">
                <p className="text-sm leading-7 text-slate-700">{lastTranscript || "—"}</p>
              </div>
              {lastScore !== null && (
                <div className="mt-6 grid gap-5 sm:grid-cols-2">
                  <MetricBar label="Interview score" value={lastScore} />
                  <MetricBar label="Follow-up pressure" value={Math.min(followUpCount * 3, 10)} />
                </div>
              )}
            </Card>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">Interview phases</h2>
            <div className="mt-5 space-y-1.5 text-sm text-slate-600">
              {["introduction", "fundamentals", "deep technical", "coding", "behavioral", "system design", "wrap up"].map((p) => (
                <div key={p} className={`flex items-center gap-2 ${currentApiPhase.replace("_", " ") === p ? "font-semibold text-blue-700" : ""}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${currentApiPhase.replace("_", " ") === p ? "bg-blue-600" : "bg-slate-300"}`} />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">How it works</h2>
            <div className="mt-5 space-y-3 text-sm leading-6 text-slate-600">
              <p>Wait for the AI to finish speaking, then press <strong>Start Speaking</strong> to answer.</p>
              <p>Press <strong>Stop Speaking</strong> when you're done with your answer.</p>
              <p><strong>Skip</strong> moves directly to the next main question.</p>
              <p><strong>Hint</strong> gives a subtle clue and simplifies the current question.</p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
