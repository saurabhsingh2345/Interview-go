"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import {
  requestAIVoiceQuestion,
  submitAIVoiceAnswer,
  skipQuestion,
  requestHint,
  completeInterview,
  exchangeSession,
  VoiceTurnResponse,
  getCodingProblem,
  submitCode,
  CodingProblem,
  CodeSubmissionResult,
} from "../../lib/api";
import { useAudioPlayer } from "../../lib/useAudioPlayer";
import { useVoiceRecorder } from "../../lib/useVoiceRecorder";
import { showToast } from "../../components/Toast";
import { InterviewerAvatar, AvatarState } from "../../components/InterviewerAvatar";
import { Transcript, TxMessage } from "../../components/Transcript";
import { MetricBar } from "../../components/ui";
import { Mic, Square, SkipForward, Lightbulb, PhoneOff, Sparkles, Play } from "lucide-react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <div className="skeleton h-[350px] w-full rounded-2xl" />,
});

const MAX_FOLLOW_UPS = 3;
const COMPLETION_SPEECH = "Interview over.";
const LANGUAGES = ["javascript", "typescript", "python", "java", "go", "cpp"] as const;
type Language = typeof LANGUAGES[number];
type UIPhase = "booting" | "playing" | "listening" | "processing" | "coding" | "code_feedback" | "complete";

const PHASES = ["introduction", "fundamentals", "deep technical", "coding", "behavioral", "system design", "wrap up"];

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
  const [messages, setMessages] = useState<TxMessage[]>([]);

  // Coding state
  const [codingProblem, setCodingProblem] = useState<CodingProblem | null>(null);
  const [codingResponseId, setCodingResponseId] = useState(0);
  const [codeLanguage, setCodeLanguage] = useState<Language>("javascript");
  const [codeValue, setCodeValue] = useState("");
  const [codeResult, setCodeResult] = useState<CodeSubmissionResult | null>(null);
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [startTime, setStartTime] = useState(0);

  const [started, setStarted] = useState(false);
  const [handoffReady, setHandoffReady] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const partnerRedirectRef = useRef("");
  const initializedRef = useRef(false);
  const handoffRef = useRef(false);
  const questionIdRef = useRef(0);
  const lastTurnCompletedRef = useRef(false);
  const playPromptRef = useRef<(turn: VoiceTurnResponse, countAsMain: boolean) => Promise<void>>(async () => {});

  const { playAudio, stopAudio, prewarm } = useAudioPlayer();

  const pushAI = useCallback((text: string, id?: string | number) => {
    if (!text.trim()) return;
    setMessages((m) => [...m, { id: id ?? `a-${m.length}-${Date.now()}`, role: "ai", text }]);
  }, []);

  // finishRedirect sends the candidate back to the partner's site when one was
  // provided at create time (redirect flow), otherwise to on-platform results.
  const finishRedirect = useCallback(() => {
    if (partnerRedirectRef.current) {
      window.location.href = partnerRedirectRef.current;
      return;
    }
    router.push(`/results/${interviewId}`);
  }, [interviewId, router]);

  // ── Coding round helpers ─────────────────────────────────────────────────────

  const enterCodingMode = useCallback(async (turn: VoiceTurnResponse) => {
    setPhase("coding");
    setQuestion(turn.text);
    pushAI(turn.text);
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
  }, [interviewId, pushAI]);

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
      await playAudio(COMPLETION_SPEECH, { onEnded: () => finishRedirect() });
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
  }, [interviewId, playAudio, finishRedirect]);

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
    if (typeof turn.transcript === "string" && turn.transcript.trim()) {
      setLastTranscript(turn.transcript);
      const meta = typeof turn.score === "number" ? `Scored ${turn.score}/10` : undefined;
      setMessages((m) => [...m, { id: `c-${m.length}-${Date.now()}`, role: "candidate", text: turn.transcript!, meta }]);
    }
    if (countAsMain) setMainQuestionCount((prev) => prev + 1);

    if (turn.completed) {
      setPhase("complete");
      setQuestion(COMPLETION_SPEECH);
      pushAI("That wraps up our interview. Putting your performance report together now…");
      setCompletedScore(turn.final_score ?? null);
      const played = await playAudio(COMPLETION_SPEECH, {
        onEnded: () => finishRedirect(),
      });
      if (!played) window.setTimeout(() => finishRedirect(), 1500);
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
    pushAI(turn.text, `a-${turn.question_id}`);

    setPhase("playing");
    const played = await playAudio(turn.text, { onEnded: () => setPhase("listening") });
    if (!played) setPhase("listening");
  }, [interviewId, playAudio, finishRedirect, stopRecording, enterCodingMode, pushAI]);

  useEffect(() => { playPromptRef.current = playPrompt; }, [playPrompt]);

  // Redirect handoff: exchange the one-time launch token (?t=) for a session
  // token before anything else, so partner-referred candidates skip login. On a
  // plain refresh (no ?t=) we fall back to the stored session token / API key.
  useEffect(() => {
    if (handoffRef.current) return;
    handoffRef.current = true;
    const url = new URL(window.location.href);
    const t = url.searchParams.get("t");
    if (!t) {
      setHandoffReady(true);
      return;
    }
    exchangeSession(t)
      .then((res) => {
        partnerRedirectRef.current = res.interview.redirect_url || "";
        url.searchParams.delete("t");
        window.history.replaceState({}, "", url.toString());
        setHandoffReady(true);
      })
      .catch((e: unknown) => {
        setHandoffError(e instanceof Error ? e.message : "Could not start your session");
      });
  }, []);

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
    finishRedirect();
  }, [interviewId, stopAudio, stopRecording, finishRedirect]);

  useEffect(() => {
    return () => { stopAudio(); stopRecording(); };
  }, [stopAudio, stopRecording]);

  useEffect(() => {
    if (recordingError) showToast(recordingError, "error");
  }, [recordingError]);

  // ── derived ──
  const avatarState: AvatarState =
    phase === "playing" ? "speaking"
    : phase === "processing" ? "thinking"
    : phase === "listening" && isRecording ? "listening"
    : "idle";

  const isSpeakingPhase = phase === "playing" || phase === "listening" || phase === "processing";

  // ── Handoff states (redirect flow) ──
  if (handoffError) {
    return (
      <div className="section-grid fade-up">
        <section className="surface p-10 sm:p-14 text-center">
          <h1 className="display text-3xl" style={{ color: "var(--foreground)" }}>Session link invalid</h1>
          <p className="mt-3 text-[0.97rem] leading-7" style={{ color: "var(--foreground-muted)" }}>
            {handoffError}. This interview link may have expired or already been used —
            please return to the site you came from and start again.
          </p>
        </section>
      </div>
    );
  }
  if (!handoffReady) {
    return (
      <div className="section-grid fade-up">
        <section className="surface p-10 sm:p-14 text-center">
          <div className="flex flex-col items-center gap-6">
            <InterviewerAvatar state="thinking" size={200} />
            <p className="text-[0.97rem]" style={{ color: "var(--foreground-muted)" }}>Preparing your interview…</p>
          </div>
        </section>
      </div>
    );
  }

  // ── Start screen ──
  if (!started) {
    return (
      <div className="section-grid fade-up">
        <section className="surface surface-glow relative overflow-hidden p-10 sm:p-14">
          <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full"
            style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }} />
          <div className="relative flex flex-col items-center gap-8 text-center">
            <InterviewerAvatar state="idle" size={260} />
            <div className="max-w-lg">
              <span className="pill pill-primary"><Sparkles className="h-3.5 w-3.5" /> Interview #{interviewId}</span>
              <h1 className="display mt-5 text-4xl" style={{ color: "var(--foreground)" }}>Ready when you are.</h1>
              <p className="mt-3 text-[0.97rem] leading-7" style={{ color: "var(--foreground-muted)" }}>
                Enfeca will speak each question aloud. When you&apos;re ready to answer, press
                <strong style={{ color: "var(--foreground)" }}> Speak</strong> — then
                <strong style={{ color: "var(--foreground)" }}> Stop</strong> when you&apos;re done.
              </p>
            </div>
            <button onClick={handleStart} className="btn btn-primary min-w-[200px]">
              <Play className="h-4 w-4" /> Begin interview
            </button>
          </div>
        </section>
      </div>
    );
  }

  // ── Coding round ──
  if (phase === "coding" || phase === "code_feedback") {
    return (
      <div className="section-grid fade-up">
        <section className="details-grid">
          <div className="space-y-6">
            <div className="surface p-6 sm:p-8">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="pill pill-primary">Coding round</span>
                {codeResult ? <span className="pill pill-success">Submitted</span> : <span className="pill pill-live">In progress</span>}
              </div>
              <h3 className="brand-wordmark mb-3 text-lg" style={{ color: "var(--foreground)" }}>Problem</h3>
              <div className="surface-subtle whitespace-pre-wrap p-5 text-sm leading-7" style={{ color: "var(--foreground-muted)" }}>
                {codingProblem?.problem_statement || question}
              </div>
              {codingProblem && codingProblem.examples.length > 0 && (
                <div className="mt-4">
                  <p className="eyebrow mb-2">Examples</p>
                  {codingProblem.examples.map((ex, i) => (
                    <div key={i} className="surface-subtle mb-2 p-3 font-mono text-xs" style={{ color: "var(--foreground-muted)" }}>
                      <div><span style={{ color: "var(--foreground-subtle)" }}>Input:</span> {ex.input}</div>
                      <div><span style={{ color: "var(--foreground-subtle)" }}>Output:</span> {ex.output}</div>
                      {ex.explanation && <div className="mt-1" style={{ color: "var(--foreground-subtle)" }}>{ex.explanation}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="surface p-6 sm:p-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="brand-wordmark text-lg" style={{ color: "var(--foreground)" }}>Your solution</h3>
                <select
                  value={codeLanguage}
                  onChange={(e) => setCodeLanguage(e.target.value as Language)}
                  disabled={phase === "code_feedback"}
                  className="theme-select text-sm"
                >
                  {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--border)" }}>
                <MonacoEditor
                  height="350px"
                  language={codeLanguage === "cpp" ? "cpp" : codeLanguage}
                  value={codeValue}
                  onChange={(v) => setCodeValue(v ?? "")}
                  options={{ readOnly: phase === "code_feedback", fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "var(--font-mono)" }}
                  theme="vs-dark"
                />
              </div>
              {phase !== "code_feedback" && (
                <button onClick={handleCodeSubmit} disabled={codeSubmitting || !codeValue.trim()} className="btn btn-primary mt-4">
                  {codeSubmitting ? <><span className="spinner" /> Reviewing…</> : "Submit solution"}
                </button>
              )}
            </div>

            {codeResult && (
              <div className="surface p-6 sm:p-8">
                <h3 className="brand-wordmark mb-4 text-lg" style={{ color: "var(--foreground)" }}>Enfeca&apos;s review</h3>
                <div className="mb-5 grid grid-cols-2 gap-4">
                  <MetricBar label="Correctness" value={codeResult.correctness} />
                  <MetricBar label="Code quality" value={codeResult.code_quality} />
                </div>
                <div className="space-y-2 text-sm" style={{ color: "var(--foreground-muted)" }}>
                  <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Time:</span> {codeResult.time_complexity || "N/A"}</p>
                  <p><span className="font-semibold" style={{ color: "var(--foreground)" }}>Space:</span> {codeResult.space_complexity || "N/A"}</p>
                  {codeResult.has_bugs && <p style={{ color: "var(--danger)" }}><span className="font-semibold">Bugs:</span> {codeResult.bug_description}</p>}
                  {codeResult.optimization_possible && <p style={{ color: "var(--warning)" }}>Optimization opportunity detected.</p>}
                  {codeResult.follow_up_question && (
                    <div className="surface-subtle mt-3 p-4" style={{ borderColor: "rgba(232,177,92,0.25)" }}>
                      <p className="text-sm" style={{ color: "var(--foreground)" }}><span className="font-semibold">Follow-up:</span> {codeResult.follow_up_question}</p>
                    </div>
                  )}
                </div>
                <button onClick={handleCodingContinue} className="btn btn-secondary mt-5">Continue →</button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="surface p-6 flex flex-col items-center gap-4">
              <InterviewerAvatar state={codeResult ? "thinking" : "idle"} size={200} />
            </div>
            {codingProblem && codingProblem.constraints.length > 0 && (
              <div className="surface p-6">
                <h2 className="brand-wordmark mb-3 text-base" style={{ color: "var(--foreground)" }}>Constraints</h2>
                <ul className="list-inside list-disc space-y-1 text-sm" style={{ color: "var(--foreground-muted)" }}>
                  {codingProblem.constraints.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            )}
            {codingProblem && codingProblem.hints.length > 0 && (
              <div className="surface p-6">
                <h2 className="brand-wordmark mb-3 text-base" style={{ color: "var(--foreground)" }}>Hints</h2>
                <ul className="list-inside list-disc space-y-1 text-sm" style={{ color: "var(--foreground-muted)" }}>
                  {codingProblem.hints.map((h, i) => <li key={i}>{h}</li>)}
                </ul>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  // ── Voice round ──
  return (
    <div className="section-grid fade-up">
      {/* Stage */}
      <section className="surface surface-glow relative overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full"
          style={{ background: `radial-gradient(circle, ${avatarState === "listening" ? "rgba(81,214,196,0.22)" : "var(--accent-glow)"}, transparent 70%)` }} />
        <div className="relative grid items-center gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <InterviewerAvatar state={avatarState} size={260} />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {currentApiPhase && <span className="pill pill-primary">{currentApiPhase.replace("_", " ")}</span>}
              {isFollowUp && <span className="pill pill-warning">Follow-up {followUpCount}/{MAX_FOLLOW_UPS}</span>}
              {phase === "complete" && <span className="pill pill-success">Complete</span>}
            </div>
            <p className="eyebrow mt-5">{isFollowUp ? "Follow-up question" : "Question"}</p>
            <p className="display mt-2 text-2xl sm:text-[1.7rem]" style={{ color: "var(--foreground)", lineHeight: 1.3 }}>
              {question || "Preparing the first question…"}
            </p>

            {/* Controls */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              {phase === "listening" && !isRecording && (
                <button onClick={() => void startRecording()} className="btn"
                  style={{ background: "linear-gradient(135deg, var(--accent-teal), #2bb6a6)", color: "#04201d", boxShadow: "0 12px 30px -8px rgba(81,214,196,0.4)" }}>
                  <Mic className="h-4 w-4" /> Speak
                </button>
              )}
              {isRecording && (
                <button onClick={stopRecording} className="btn"
                  style={{ background: "var(--accent-teal-soft)", color: "var(--accent-teal)", border: "1px solid rgba(81,214,196,0.4)" }}>
                  <span className="record-pulse"><span /><span /><span /></span> Stop
                </button>
              )}
              {phase === "processing" && (
                <span className="pill pill-warning"><span className="spinner" style={{ width: 14, height: 14 }} /> Transcribing &amp; evaluating…</span>
              )}
              {isSpeakingPhase && phase !== "processing" && (
                <>
                  <button onClick={() => void handleSkip()} className="btn btn-secondary"><SkipForward className="h-4 w-4" /> Skip</button>
                  <button onClick={() => void handleHint()} className="btn btn-secondary"><Lightbulb className="h-4 w-4" /> Hint</button>
                  <button onClick={() => void handleEndInterview()} className="btn btn-ghost" style={{ color: "var(--danger)" }}><PhoneOff className="h-4 w-4" /> End</button>
                </>
              )}
              {phase === "complete" && (
                <span className="pill pill-success">Finished{completedScore != null ? ` · ${completedScore.toFixed(1)}/10` : ""} — redirecting…</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Transcript + sidebar */}
      <section className="details-grid">
        <div className="surface flex flex-col p-6 sm:p-7" style={{ maxHeight: "62vh" }}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="brand-wordmark text-lg" style={{ color: "var(--foreground)" }}>Live transcript</h2>
            <span className="pill pill-live"><span className="status-dot" /> Recording session</span>
          </div>
          <div className="-mr-2 flex-1 overflow-y-auto pr-2">
            <Transcript
              messages={messages}
              typing={phase === "processing" ? "ai" : null}
              emptyHint="Enfeca is preparing the first question…"
            />
          </div>
        </div>

        <div className="space-y-6">
          {lastScore !== null && (
            <div className="surface p-6 text-center">
              <p className="eyebrow">Last answer</p>
              <div className="kpi-value mt-2" style={{ color: "var(--accent-amber)" }}>{lastScore.toFixed(1)}</div>
              <p className="text-xs" style={{ color: "var(--foreground-subtle)" }}>out of 10</p>
              <div className="mt-4">
                <MetricBar label="Score" value={lastScore} />
              </div>
              {lastTranscript && (
                <p className="surface-subtle mt-4 p-3 text-left text-xs leading-6" style={{ color: "var(--foreground-muted)" }}>
                  “{lastTranscript.slice(0, 220)}{lastTranscript.length > 220 ? "…" : ""}”
                </p>
              )}
            </div>
          )}

          <div className="surface p-6">
            <h2 className="brand-wordmark text-base" style={{ color: "var(--foreground)" }}>Interview stages</h2>
            <div className="mt-5 space-y-1">
              {PHASES.map((p) => {
                const active = currentApiPhase.replace("_", " ") === p;
                return (
                  <div key={p} className="nav-link" style={active ? undefined : { background: "transparent", borderColor: "transparent" }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: active ? "var(--accent-amber)" : "var(--foreground-subtle)", opacity: active ? 1 : 0.4 }} />
                    <span style={{ color: active ? "var(--accent-amber-strong)" : "var(--foreground-muted)", fontWeight: active ? 700 : 500 }}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
