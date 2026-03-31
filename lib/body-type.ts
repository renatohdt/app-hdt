import type { BodyType, QuizAnswers, Wrist } from "@/lib/types";

const RAW_TO_BODY_TYPE: Record<string, BodyType> = {
  not_touch: "endomorph",
  dont_touch: "endomorph",
  just_touch: "mesomorph",
  overlap: "ectomorph",
  endomorph: "endomorph",
  mesomorph: "mesomorph",
  ectomorph: "ectomorph"
};

const BODY_TYPE_TO_CANONICAL_RAW: Record<Exclude<BodyType, "unknown">, Wrist> = {
  endomorph: "not_touch",
  mesomorph: "just_touch",
  ectomorph: "overlap"
};

const BODY_TYPE_LABELS: Record<BodyType, string> = {
  endomorph: "Endomorfo",
  mesomorph: "Mesomorfo",
  ectomorph: "Ectomorfo",
  unknown: "Não informado"
};

export function normalizeBodyTypeRaw(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || undefined;
}

export function isRawBodyTypeValue(value?: string | null): value is Wrist {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "dont_touch" || normalized === "not_touch" || normalized === "just_touch" || normalized === "overlap";
}

export function isMappedBodyType(value?: string | null): value is Exclude<BodyType, "unknown"> {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "endomorph" || normalized === "mesomorph" || normalized === "ectomorph";
}

export function mapBodyType(input?: string | null): BodyType {
  const normalized = normalizeBodyTypeRaw(input);
  if (!normalized) {
    return "unknown";
  }

  return RAW_TO_BODY_TYPE[normalized] ?? "unknown";
}

export function resolveBodyType(
  source?: Partial<Pick<QuizAnswers, "body_type" | "body_type_raw" | "wrist">> | null
) {
  if (!source) {
    return "unknown" as BodyType;
  }

  if (isMappedBodyType(source.body_type)) {
    return source.body_type;
  }

  return mapBodyType(source.body_type_raw ?? source.wrist ?? source.body_type);
}

export function normalizeBodyTypeFields<T extends Partial<Pick<QuizAnswers, "body_type" | "body_type_raw" | "wrist">>>(
  source: T
) {
  const normalizedWrist = normalizeBodyTypeRaw(source.wrist);
  const normalizedBodyTypeRaw = normalizeBodyTypeRaw(source.body_type_raw);
  const normalizedBodyType = isMappedBodyType(source.body_type) ? source.body_type : undefined;
  const raw =
    (isRawBodyTypeValue(normalizedBodyTypeRaw) && normalizedBodyTypeRaw) ||
    (isRawBodyTypeValue(normalizedWrist) && normalizedWrist) ||
    (isRawBodyTypeValue(source.body_type) ? source.body_type : undefined) ||
    (normalizedBodyType ? BODY_TYPE_TO_CANONICAL_RAW[normalizedBodyType] : undefined);
  const bodyType = normalizedBodyType ?? resolveBodyType({ body_type_raw: raw, wrist: raw });
  const wrist = raw ?? (bodyType !== "unknown" ? BODY_TYPE_TO_CANONICAL_RAW[bodyType] : "dont_touch");

  return {
    ...source,
    wrist,
    body_type_raw: raw,
    body_type: bodyType
  };
}

export function formatBodyTypeLabel(value?: string | null) {
  const bodyType = isMappedBodyType(value) ? value : mapBodyType(value);
  return BODY_TYPE_LABELS[bodyType];
}


