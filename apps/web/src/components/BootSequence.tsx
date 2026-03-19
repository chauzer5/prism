import { useState, useEffect } from "react";
import { trpc } from "@/trpc";

export function BootSequence({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<"fade-in" | "hold" | "fade-out" | "done">("fade-in");
  const ping = trpc.health.ping.useQuery(undefined, {
    refetchInterval: 1_000,
    retry: Infinity,
  });
  const serverUp = !!ping.data;

  // Phase transitions
  useEffect(() => {
    if (phase === "fade-in") {
      const timer = setTimeout(() => setPhase("hold"), 800);
      return () => clearTimeout(timer);
    }
  }, [phase]);

  useEffect(() => {
    // Once server is up and we've been holding, start fade out
    if (phase === "hold" && serverUp) {
      const timer = setTimeout(() => setPhase("fade-out"), 400);
      return () => clearTimeout(timer);
    }
  }, [phase, serverUp]);

  useEffect(() => {
    if (phase === "fade-out") {
      const timer = setTimeout(() => {
        setPhase("done");
        onComplete();
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [phase, onComplete]);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background transition-opacity duration-500"
      style={{ opacity: phase === "fade-out" ? 0 : 1 }}
    >
      <img
        src="/prism-logo.png"
        alt="PRISM"
        className="h-16 object-contain transition-opacity duration-700"
        style={{ opacity: phase === "fade-in" ? 0 : 1 }}
      />
    </div>
  );
}
