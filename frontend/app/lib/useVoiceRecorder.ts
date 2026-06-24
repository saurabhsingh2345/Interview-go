"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceRecorderOptions {
  silenceMs?: number;
  maxDurationMs?: number;
  onRecordingComplete: (blob: Blob, fileName: string) => Promise<void> | void;
}

const DEFAULT_SILENCE_MS = 1500;
const DEFAULT_MAX_DURATION_MS = 30000;
const SILENCE_THRESHOLD = 0.02;

function pickSupportedMimeType() {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

export function useVoiceRecorder({
  silenceMs = DEFAULT_SILENCE_MS,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  onRecordingComplete,
}: UseVoiceRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const silenceStartRef = useRef<number | null>(null);
  const heardSpeechRef = useRef(false);
  const onRecordingCompleteRef = useRef(onRecordingComplete);

  useEffect(() => {
    onRecordingCompleteRef.current = onRecordingComplete;
  }, [onRecordingComplete]);

  const cleanupMonitoring = useCallback(() => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    analyserRef.current = null;

    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupMonitoring();
      cleanupStream();
      setIsRecording(false);
      return;
    }

    recorder.stop();
  }, [cleanupMonitoring, cleanupStream]);

  const startMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      const activeRecorder = recorderRef.current;
      if (!analyser || !activeRecorder || activeRecorder.state !== "recording") {
        return;
      }

      analyser.getByteTimeDomainData(data);

      let sum = 0;
      for (const value of data) {
        const normalized = value / 128 - 1;
        sum += normalized * normalized;
      }

      const rms = Math.sqrt(sum / data.length);
      const now = Date.now();

      if (rms > SILENCE_THRESHOLD) {
        heardSpeechRef.current = true;
        silenceStartRef.current = null;
      } else if (heardSpeechRef.current) {
        if (silenceStartRef.current === null) {
          silenceStartRef.current = now;
        } else if (now-silenceStartRef.current >= silenceMs) {
          stopRecording();
          return;
        }
      }

      if (maxDurationMs > 0 && now-startTimeRef.current >= maxDurationMs) {
        stopRecording();
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);
  }, [maxDurationMs, silenceMs, stopRecording]);

  const startRecording = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Audio recording is not supported in this browser.");
      return false;
    }

    if (recorderRef.current?.state === "recording") {
      return true;
    }

    try {
      setError(null);
      heardSpeechRef.current = false;
      silenceStartRef.current = null;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);

      audioContextRef.current = audioContext;
      sourceRef.current = source;
      analyserRef.current = analyser;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = () => {
        setError("Unable to record audio.");
        cleanupMonitoring();
        cleanupStream();
        setIsRecording(false);
      };

      recorder.onstop = async () => {
        const blobType = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: blobType });

        recorderRef.current = null;
        cleanupMonitoring();
        cleanupStream();
        setIsRecording(false);

        if (blob.size === 0) {
          setError("Recorded audio was empty.");
          return;
        }

        const extension = blobType.includes("mp4") ? "mp4" : "webm";
        await onRecordingCompleteRef.current(blob, `answer.${extension}`);
      };

      startTimeRef.current = Date.now();
      recorder.start(250);
      setIsRecording(true);
      startMonitoring();
      return true;
    } catch {
      cleanupMonitoring();
      cleanupStream();
      setIsRecording(false);
      setError("Microphone permission is required to continue the interview.");
      return false;
    }
  }, [cleanupMonitoring, cleanupStream, startMonitoring]);

  useEffect(() => {
    return () => {
      stopRecording();
      cleanupMonitoring();
      cleanupStream();
    };
  }, [cleanupMonitoring, cleanupStream, stopRecording]);

  return {
    error,
    isRecording,
    startRecording,
    stopRecording,
  };
}
