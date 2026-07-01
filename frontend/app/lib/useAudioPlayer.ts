"use client";

import { useCallback, useRef, useState } from "react";

const TTS_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8113/api/v1"}/tts`;
const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

interface PlayAudioOptions {
  onEnded?: () => void;
}

export function useAudioPlayer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // No-op: HTML audio doesn't need a speech-synthesis gesture prewarm.
  // Kept so the interview page doesn't need to change its call site.
  const prewarm = useCallback(() => {}, []);

  const playAudio = useCallback(
    async (text?: string, options?: PlayAudioOptions) => {
      if (!text) {
        options?.onEnded?.();
        return false;
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setIsPlaying(true);

      try {
        const res = await fetch(TTS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
          },
          body: JSON.stringify({ text }),
        });

        if (!res.ok) throw new Error(`TTS API returned ${res.status}`);

        const { audio } = (await res.json()) as { audio: string };

        const binary = atob(audio);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

        const blob = new Blob([bytes], { type: "audio/wav" });
        const url = URL.createObjectURL(blob);
        const el = new Audio(url);
        audioRef.current = el;

        el.onended = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setIsPlaying(false);
          options?.onEnded?.();
        };
        el.onerror = (e) => {
          console.error("[TTS] playback error:", e);
          URL.revokeObjectURL(url);
          audioRef.current = null;
          setIsPlaying(false);
          options?.onEnded?.();
        };

        await el.play();
        return true;
      } catch (e) {
        console.error("[TTS] error:", e);
        setIsPlaying(false);
        options?.onEnded?.();
        return false;
      }
    },
    []
  );

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  return { isPlaying, playAudio, stopAudio, prewarm };
}
