"use client";

import {
  LiveKitRoom,
  RoomAudioRenderer,
  useVoiceAssistant,
  BarVisualizer,
  DisconnectButton,
} from "@livekit/components-react";
import "@livekit/components-styles";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MediaDeviceFailure } from "livekit-client";

export default function Home() {
  const [connectionDetails, setConnectionDetails] = useState<{
    token: string;
    url: string;
  } | null>(null);

  const connect = useCallback(async () => {
    const res = await fetch("/api/token");
    const details = await res.json();
    setConnectionDetails(details);
  }, []);

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: "1rem",
        fontFamily: "sans-serif",
        background: "#0a0a0a",
        color: "#fafafa",
      }}
    >
      {!connectionDetails ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          <MicTest />
          <button
            onClick={connect}
            style={{
              padding: "0.75rem 2rem",
              fontSize: "1.1rem",
              borderRadius: "8px",
              border: "1px solid #333",
              background: "#1a1a1a",
              color: "#fafafa",
              cursor: "pointer",
            }}
          >
            Start Conversation
          </button>
        </div>
      ) : (
        <LiveKitRoom
          token={connectionDetails.token}
          serverUrl={connectionDetails.url}
          connect={true}
          audio={true}
          onMediaDeviceFailure={onDeviceFailure}
          onDisconnected={() => setConnectionDetails(null)}
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}
        >
          <AgentView />
          <RoomAudioRenderer />
          <DisconnectButton>End Conversation</DisconnectButton>
        </LiveKitRoom>
      )}
    </main>
  );
}

function AgentView() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
      <BarVisualizer
        state={state}
        barCount={5}
        trackRef={audioTrack}
        style={{ width: "200px", height: "100px" }}
      />
      <p style={{ textTransform: "capitalize", opacity: 0.6 }}>{state}</p>
    </div>
  );
}

type MicStatus = "idle" | "recording" | "playing";

function MicTest() {
  const [status, setStatus] = useState<MicStatus>("idle");
  const [level, setLevel] = useState(0);
  const [countdown, setCountdown] = useState(3);
  const rafRef = useRef<number>(0);

  const start = useCallback(async () => {
    if (status !== "idle") return;

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert("Could not access microphone.");
      return;
    }

    // Set up level meter
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    const freqData = new Uint8Array(analyser.frequencyBinCount);

    const poll = () => {
      analyser.getByteFrequencyData(freqData);
      const avg = freqData.reduce((a, b) => a + b, 0) / freqData.length;
      setLevel(avg / 255);
      rafRef.current = requestAnimationFrame(poll);
    };

    // Record for 3 seconds
    const recorder = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(rafRef.current);
      setLevel(0);
      ctx.close();

      // Play back
      const blob = new Blob(chunks, { type: recorder.mimeType });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      setStatus("playing");
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setStatus("idle");
        setCountdown(3);
      };
      audio.play();
    };

    setStatus("recording");
    setCountdown(3);
    recorder.start();
    poll();

    let remaining = 3;
    const interval = setInterval(() => {
      remaining--;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        recorder.stop();
      }
    }, 1000);
  }, [status]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const label =
    status === "recording"
      ? `Recording... ${countdown}s`
      : status === "playing"
        ? "Playing back..."
        : "Test Microphone";

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
      <button
        onClick={start}
        disabled={status !== "idle"}
        style={{
          padding: "0.5rem 1.5rem",
          fontSize: "0.9rem",
          borderRadius: "8px",
          border: "1px solid #333",
          background: status === "recording" ? "#2a1a1a" : status === "playing" ? "#1a1a2a" : "#1a1a1a",
          color: "#fafafa",
          cursor: status === "idle" ? "pointer" : "default",
          opacity: status === "idle" ? 1 : 0.8,
        }}
      >
        {label}
      </button>
      {status === "recording" && (
        <div
          style={{
            width: "200px",
            height: "8px",
            background: "#222",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${level * 100}%`,
              height: "100%",
              background: level > 0.05 ? "#4ade80" : "#555",
              borderRadius: "4px",
              transition: "width 0.05s",
            }}
          />
        </div>
      )}
    </div>
  );
}

function onDeviceFailure(error?: MediaDeviceFailure) {
  console.error("Media device failure:", error);
  alert("Please allow microphone access to use the voice agent.");
}
