"use client";

import { useState } from "react";

export function WeightTracker({ exercises }: { exercises: { name: string }[] }) {
  const [values, setValues] = useState<Record<string, string>>({});

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <h3 className="text-lg font-semibold">Registro de cargas</h3>
      <div className="mt-4 grid gap-3">
        {exercises.map((exercise) => (
          <label key={exercise.name} className="grid gap-2 rounded-2xl border border-white/8 p-3">
            <span className="text-sm text-white/78">{exercise.name}</span>
            <input
              type="text"
              placeholder="Exemplo: 22kg x 10"
              value={values[exercise.name] ?? ""}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [exercise.name]: event.target.value
                }))
              }
              className="min-h-11 rounded-2xl border border-white/10 bg-black/20 px-4 text-sm outline-none focus:border-primary"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
