"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { requestAIVoiceQuestion, submitAIVoiceAnswer, VoiceTurnResponse } from "../../lib/api";
import { useAudioPlayer } from "../../lib/useAudioPlayer";
import { useVoiceRecorder } from "../../lib/useVoiceRecorder";
import { showToast } from "../../components/Toast";
import { Badge, Card, MetricBar, PageHeader, SubtleCard } from "../../components/ui";

const MAX_MAIN_QUESTIONS = 5;
const MAX_FOLLOW_UPS = 3;
const NEXT_PROMPT_DELAY_MS = 10000;
const COMPLETION_SPEECH = "Interview over.";

type InterviewPhase = "booting" | "playing" | "listening" | "processing" | "complete";

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = Number(params.id);

  const [phase, setPhase] = useState<InterviewPhase>("booting");
  const [question, setQuestion] = useState("");
  const [mainQuestionCount, setMainQuestionCount] = useState(0);
  const [followUpCount, setFollowUpCount] = useState(0);
  const [lastTranscript, setLastTranscript] = useState("");
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [completedScore, setCompletedScore] = useState<string>("");
  const [isFollowUp, setIsFollowUp] = useState(false);

  const [started, setStarted] = useState(false);
  const initializedRef = useRef(false);
  const hasPlayedFirstPromptRef = useRef(false);
  const questionIdRef = useRef(0);
  const lastTurnCompletedRef = useRef(false);
  const playPromptRef = useRef<(turn: VoiceTurnResponse, countAsMain: boolean) => Promise<void>>(async () => {});

  const { isPlaying, playAudio, stopAudio, prewarm } = useAudioPlayer();

  const submitRecordedAnswer = useCallback(async (blob: Blob, filename: string) => {
    if (!questionIdRef.current) {
      return;
    }

    if (lastTurnCompletedRef.current) {
      setPhase("complete");
      setQuestion(COMPLETION_SPEECH);
      await playAudio(COMPLETION_SPEECH);
      return;
    }

    setPhase("processing");

    try {
      const nextTurn = await submitAIVoiceAnswer(interviewId, questionIdRef.current, blob, filename);
      const shouldIncrementMainQuestion = !nextTurn.follow_up && !nextTurn.completed;
      await playPromptRef.current(nextTurn, shouldIncrementMainQuestion);
    } catch (error) {
      setPhase("listening");
      showToast(
        error instanceof Error ? error.message : "Failed to process the recorded answer",
        "error"
      );
    }
  }, [interviewId]);

  const { error: recordingError, isRecording, startRecording, stopRecording } = useVoiceRecorder({
    silenceMs: 1500,
    maxDurationMs: 0,
    onRecordingComplete: submitRecordedAnswer,
  });

  const playPrompt = useCallback(async (turn: VoiceTurnResponse, countAsMain: boolean) => {
    stopRecording();
    setQuestion(turn.text);
    questionIdRef.current = turn.question_id;
    setFollowUpCount(turn.follow_up_count || 0);
    setIsFollowUp(turn.follow_up);
    lastTurnCompletedRef.current = turn.completed;

    if (typeof turn.score === "number") {
      setLastScore(turn.score);
    }

    if (typeof turn.transcript === "string") {
      setLastTranscript(turn.transcript);
    }

    if (countAsMain) {
      setMainQuestionCount((prev) => prev + 1);
    }

    if (turn.completed) {
      setPhase("complete");
      setQuestion(COMPLETION_SPEECH);
      setCompletedScore(turn.final_score || "");
      const played = await playAudio(COMPLETION_SPEECH, {
        onEnded: () => router.push(`/results/${interviewId}`),
      });

      if (!played) {
        window.setTimeout(() => {
          router.push(`/results/${interviewId}`);
        }, 1500);
      }
      return;
    }

    if (hasPlayedFirstPromptRef.current) {
      setPhase("processing");
      await new Promise((resolve) => window.setTimeout(resolve, NEXT_PROMPT_DELAY_MS));
    }

    setPhase("playing");
    const played = await playAudio(turn.text, {
      onEnded: () => {
        setPhase("listening");
        void startRecording();
      },
    });

    if (!played) {
      setPhase("listening");
      void startRecording();
    }

    hasPlayedFirstPromptRef.current = true;
  }, [interviewId, playAudio, router, startRecording, stopRecording]);

  useEffect(() => {
    playPromptRef.current = playPrompt;
  }, [playPrompt]);

  const handleStart = useCallback(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setStarted(true);
    prewarm(); // unlock speechSynthesis synchronously inside this click handler

    void requestAIVoiceQuestion(interviewId)
      .then((turn) => playPrompt(turn, !turn.follow_up && !turn.completed))
      .catch((error: unknown) => {
        showToast(
          error instanceof Error ? error.message : "Failed to start the interview",
          "error"
        );
      });
  }, [interviewId, playPrompt, prewarm]);

  useEffect(() => {
    return () => {
      stopAudio();
      stopRecording();
    };
  }, [stopAudio, stopRecording]);

  useEffect(() => {
    if (recordingError) {
      showToast(recordingError, "error");
    }
  }, [recordingError]);

  const progressPercent = `${(Math.max(mainQuestionCount, 1) / MAX_MAIN_QUESTIONS) * 100}%`;
  const statusLabel =
    phase === "booting"
      ? "Preparing interview..."
      : phase === "playing"
      ? "AI speaking..."
      : phase === "listening"
      ? "Listening..."
      : phase === "processing"
      ? "Processing..."
      : "Interview complete";

  if (!started) {
    return (
      <div className="section-grid">
        <PageHeader
          eyebrow="Voice interview"
          title={`Interview #${interviewId}`}
          description="The system speaks, listens, evaluates, and decides follow-ups automatically with no manual answer controls."
        />
        <section className="details-grid">
          <Card className="p-8 sm:p-12 flex flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-2xl font-semibold text-blue-700">
              AI
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-950">Ready to begin</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Click Start to allow audio playback. The AI will speak each question aloud and listen for your answer automatically.
              </p>
            </div>
            <button
              onClick={handleStart}
              className="rounded-2xl bg-blue-600 px-8 py-3 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800 transition-colors"
            >
              Start Interview
            </button>
          </Card>
        </section>
      </div>
    );
  }

  return (
    <div className="section-grid">
      <PageHeader
        eyebrow="Voice interview"
        title={`Interview #${interviewId}`}
        description="The system speaks, listens, evaluates, and decides follow-ups automatically with no manual answer controls."
      />

      <section className="details-grid">
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="primary">Question {Math.max(mainQuestionCount, 1)} of {MAX_MAIN_QUESTIONS}</Badge>
              {isFollowUp ? <Badge tone="warning">Follow-up {followUpCount} of {MAX_FOLLOW_UPS}</Badge> : null}
              <Badge tone={phase === "processing" ? "warning" : phase === "complete" ? "success" : "primary"}>
                {statusLabel}
              </Badge>
              {isPlaying ? <Badge tone="neutral">Autoplay</Badge> : null}
              {isRecording ? <Badge tone="danger">Mic live</Badge> : null}
            </div>

            <div className="mt-6">
              <div className="metric-track">
                <div className="metric-fill" style={{ width: progressPercent }} />
              </div>
            </div>

            <div className="mt-8 rounded-[24px] bg-slate-50 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-sm font-semibold text-blue-700">
                  AI
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {isFollowUp ? "Follow-up prompt" : "Current prompt"}
                  </p>
                  <p className="mt-3 text-base font-semibold leading-7 text-slate-950">
                    {question || "Preparing the first question..."}
                  </p>
                </div>
              </div>
            </div>

            {phase === "processing" ? (
              <SubtleCard className="mt-6 border-blue-100 bg-blue-50/70 p-4">
                <p className="text-sm text-blue-900">
                  The answer is being transcribed with Groq Whisper, scored, and routed to the next main or follow-up question.
                </p>
              </SubtleCard>
            ) : null}

            {phase === "listening" ? (
              <SubtleCard className="mt-6 border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm text-emerald-900">
                  Listening for the candidate response. Recording stops automatically after 1.5 seconds of silence or at 30 seconds.
                </p>
              </SubtleCard>
            ) : null}

            {phase === "complete" ? (
              <SubtleCard className="mt-6 border-emerald-100 bg-emerald-50/70 p-4">
                <p className="text-sm text-emerald-900">
                  Interview finished{completedScore ? ` with a final score of ${completedScore}` : ""}. Redirecting to results.
                </p>
              </SubtleCard>
            ) : null}
          </Card>

          <Card className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Latest answer</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Transcription is produced from the recorded upload, not from browser speech recognition.
                </p>
              </div>
              {lastScore !== null ? (
                <div className="rounded-[24px] bg-slate-50 px-6 py-5 text-center">
                  <div className="brand-wordmark text-4xl text-slate-950">{lastScore.toFixed(1)}</div>
                  <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Score</div>
                </div>
              ) : null}
            </div>

            <div className="mt-6 rounded-[24px] bg-slate-50 p-5">
              <p className="text-sm leading-7 text-slate-700">
                {lastTranscript || "The transcript from the latest recorded answer will appear here after processing."}
              </p>
            </div>

            {lastScore !== null ? (
              <div className="mt-8 grid gap-5 sm:grid-cols-2">
                <MetricBar label="Interview score" value={lastScore} />
                <MetricBar label="Follow-up pressure" value={Math.min(followUpCount * 3, 10)} />
              </div>
            ) : null}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">Loop state</h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
              <p>Prompt playback starts automatically using the browser speech synthesis voice.</p>
              <p>Once playback ends, the microphone opens automatically and watches for silence to stop recording.</p>
              <p>Each answer is transcribed, scored from 0 to 10, and used to decide whether a follow-up is needed.</p>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-slate-950">Routing rules</h2>
            <div className="mt-5 space-y-4 text-sm leading-6 text-slate-600">
              <p>Scores of 8 or higher move directly to the next main question.</p>
              <p>Scores from 3 to 7 trigger a follow-up until the chain reaches three follow-ups.</p>
              <p>Scores below 2 stop follow-ups and advance the session so the loop never gets stuck.</p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  );
}
