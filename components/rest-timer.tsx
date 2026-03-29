"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

export function RestTimer() {
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running || seconds === 0) return;

    const timer = window.setTimeout(() => setSeconds((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [running, seconds]);

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-white/62">Timer de descanso</p>
      <div className="mt-2 text-3xl font-semibold">{seconds}s</div>
      <div className="mt-4 flex gap-3">
        <Button onClick={() => setRunning((current) => !current)}>{running ? "Pausar" : "Iniciar"}</Button>
        <Button
          variant="secondary"
          onClick={() => {
            setRunning(false);
            setSeconds(60);
          }}
        >
          Reiniciar
        </Button>
      </div>
    </div>
  );
}
