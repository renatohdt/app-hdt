import type {
  CombinedBlockType,
  WorkoutExercise,
  WorkoutSectionItem
} from "@/lib/types";
import { formatBlockTypeLabel, formatMuscleLabel, isCombinedBlockType, normalizeBlockType } from "@/lib/workout-strategy";

const BLOCK_MIN_SIZE: Record<CombinedBlockType, number> = {
  superset: 2,
  "bi-set": 2,
  "tri-set": 3,
  circuit: 3
};

const BLOCK_ORDER_PREFIX: Record<CombinedBlockType, string> = {
  superset: "A",
  "bi-set": "B",
  "tri-set": "C",
  circuit: "D"
};

export function buildWorkoutSectionItems(mobility: WorkoutExercise[], exercises: WorkoutExercise[]): WorkoutSectionItem[] {
  const items: WorkoutSectionItem[] = mobility.map((exercise) => ({
    ...exercise,
    type: "mobility",
    blockType: "mobility"
  }));

  let cursor = 0;

  while (cursor < exercises.length) {
    const current = exercises[cursor];
    const normalizedBlockType = normalizeBlockType(
      current.blockType ?? current.type ?? current.trainingTechnique ?? current.technique
    );

    if (isCombinedBlockType(normalizedBlockType)) {
      const blockType = normalizedBlockType as CombinedBlockType;
      const group = [current];
      let lookahead = cursor + 1;

      while (lookahead < exercises.length) {
        const next = exercises[lookahead];
        const nextBlockType = normalizeBlockType(next.blockType ?? next.type ?? next.trainingTechnique ?? next.technique);
        const sameBlockId = Boolean(current.blockId && next.blockId && current.blockId === next.blockId);
        const sameInlineGroup = !current.blockId && nextBlockType === blockType;

        if (!sameBlockId && !sameInlineGroup) {
          break;
        }

        group.push(next);
        lookahead += 1;
      }

      if (group.length >= BLOCK_MIN_SIZE[blockType]) {
        items.push(buildCombinedBlockItem(blockType, group));
        cursor = lookahead;
        continue;
      }
    }

    items.push({
      ...current,
      type: current.blockType === "mobility" ? "mobility" : "exercise"
    });
    cursor += 1;
  }

  return items;
}

export function flattenWorkoutSectionItems(items: WorkoutSectionItem[]) {
  const mobility: WorkoutExercise[] = [];
  const exercises: WorkoutExercise[] = [];

  items.forEach((item, index) => {
    if (item.type === "combined_block") {
      const blockId = item.exercises[0]?.blockId?.trim() || `${item.blockType}-${index + 1}`;

      item.exercises.forEach((exercise, exerciseIndex) => {
        exercises.push({
          ...exercise,
          type: "normal",
          blockType: item.blockType,
          blockId,
          blockLabel: item.blockLabel,
          rounds: item.rounds,
          restAfterRound: item.restAfterRound,
          blockNotes: item.notes ?? null,
          order: exercise.order ?? buildExerciseOrder(item.blockType, exerciseIndex)
        });
      });
      return;
    }

    const normalizedExercise: WorkoutExercise = {
      ...item,
      type: item.type,
      blockType: item.type === "mobility" ? "mobility" : item.blockType ?? "normal"
    };

    if (item.type === "mobility") {
      mobility.push(normalizedExercise);
      return;
    }

    exercises.push(normalizedExercise);
  });

  return {
    mobility,
    exercises,
    allExercises: [...mobility, ...exercises]
  };
}

function buildCombinedBlockItem(blockType: CombinedBlockType, exercises: WorkoutExercise[]): WorkoutSectionItem {
  const labeledExercises = exercises.map((exercise, index) => ({
    ...exercise,
    order: exercise.order ?? buildExerciseOrder(blockType, index),
    rest: exercise.rest || getDefaultInBlockRest(blockType, index)
  }));

  return {
    type: "combined_block",
    blockType,
    blockLabel: exercises[0]?.blockLabel?.trim() || buildBlockLabel(blockType, labeledExercises),
    rounds: exercises[0]?.rounds?.trim() || inferRounds(labeledExercises),
    restAfterRound: exercises[0]?.restAfterRound?.trim() || inferRoundRest(blockType),
    notes: exercises[0]?.blockNotes?.trim() || buildCombinedBlockNotes(blockType, labeledExercises.length),
    exercises: labeledExercises
  };
}

function buildBlockLabel(blockType: CombinedBlockType, exercises: WorkoutExercise[]) {
  const muscles = Array.from(
    new Set(
      exercises
        .flatMap((exercise) => exercise.primaryMuscles ?? [])
        .map((muscle) => formatMuscleLabel(muscle))
        .filter(Boolean)
    )
  ).slice(0, 3);

  if (!muscles.length) {
    return formatBlockTypeLabel(blockType);
  }

  return `${formatBlockTypeLabel(blockType)} de ${joinLabels(muscles)}`;
}

function buildCombinedBlockNotes(blockType: CombinedBlockType, exerciseCount: number) {
  if (blockType === "circuit") {
    return "Execute os exercícios em sequência, mantendo ritmo controlado, e descanse apenas ao fim da volta.";
  }

  if (blockType === "tri-set") {
    return "Complete os três exercícios em sequência antes de descansar ao final da volta.";
  }

  if (blockType === "bi-set") {
    return "Una os dois exercícios sem pausa longa para aumentar a densidade, mantendo a técnica.";
  }

  return exerciseCount > 1
    ? "Complete a sequencia inteira antes de descansar ao final da volta."
    : "Use o bloco para manter o treino mais eficiente sem perder controle.";
}

function inferRounds(exercises: WorkoutExercise[]) {
  const numericSets = exercises
    .map((exercise) => Number.parseInt(exercise.sets, 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!numericSets.length) {
    return "3";
  }

  return String(Math.max(2, Math.min(...numericSets)));
}

function inferRoundRest(blockType: CombinedBlockType) {
  if (blockType === "circuit") return "60-75 segundos";
  if (blockType === "tri-set") return "75 segundos";
  return "60-90 segundos";
}

function getDefaultInBlockRest(blockType: CombinedBlockType, index: number) {
  if (blockType === "circuit") {
    return index === 0 ? "0-15 segundos" : "0 segundos";
  }

  return index === 0 ? "0-15 segundos" : "0 segundos";
}

function buildExerciseOrder(blockType: CombinedBlockType, index: number) {
  const prefix = BLOCK_ORDER_PREFIX[blockType];
  return `${prefix}${index + 1}`;
}

function joinLabels(values: string[]) {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} e ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")} e ${values[values.length - 1]}`;
}
