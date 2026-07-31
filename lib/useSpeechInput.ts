"use client";

import { useEffect, useRef, useState } from "react";

// Chrome/Safari only ship the vendor-prefixed constructor; TypeScript's DOM
// lib doesn't declare either, so this is a minimal shim for what we actually use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

// Looks up whichever speech recognition constructor the current browser exposes.
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
}

/** Wraps the browser's native speech-to-text so a mic button can dictate into a text input. */
export function useSpeechInput(onResult: (transcript: string) => void) {
  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const baseTextRef = useRef("");

  useEffect(() => {
    setIsSupported(getSpeechRecognitionCtor() !== undefined);
  }, []);

  // Stops the current recognition session, if one is running.
  const stop = () => {
    recognitionRef.current?.stop();
  };

  // Starts a new recognition session, seeded with the text already in the box
  // so dictation appends instead of overwriting it.
  const start = (currentText: string) => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    setError(null);
    baseTextRef.current = currentText ? `${currentText} ` : "";

    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      onResult(baseTextRef.current + transcript);
    };
    recognition.onerror = (event) => {
      setError(
        event.error === "not-allowed"
          ? "Microphone access denied."
          : "Speech recognition error."
      );
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  // Flips between listening and stopped, called by the mic button's onClick.
  const toggle = (currentText: string) => {
    if (isListening) {
      stop();
    } else {
      start(currentText);
    }
  };

  useEffect(() => stop, []);

  return { isSupported, isListening, error, toggle };
}
