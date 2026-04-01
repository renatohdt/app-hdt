import { isValidEmail } from "@/lib/auth-errors";
import { normalizeBodyTypeFields } from "@/lib/body-type";
import { applyHealthConsentToAnswers, hasUserConsent } from "@/lib/consents";
import { requireAuthenticatedUser } from "@/lib/server-auth";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { jsonError, jsonSuccess } from "@/lib/server-response";
import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { createSupabaseUserClient } from "@/lib/supabase-user";
import type { BodyType, Gender, Goal, HomeEquipment, QuizAnswers } from "@/lib/types";
import { getUserAnswersByUserId, saveUserAnswers } from "@/lib/user-answers";

export const dynamic = "force-dynamic";

const GOAL_OPTIONS: Goal[] = ["lose_weight", "gain_muscle", "body_recomposition", "improve_conditioning"];
const GENDER_OPTIONS: Gender[] = ["male", "female"];
const BODY_TYPE_OPTIONS: BodyType[] = ["endomorph", "mesomorph", "ectomorph"];
const EQUIPMENT_OPTIONS: HomeEquipment[] = [
  "halteres",
  "elasticos",
  "fitball",
  "fita_suspensa",
  "caneleira",
  "kettlebell",
  "nenhum"
];
const TIME_OPTIONS = [15, 30, 45, 60, 75, 90];

type ProfilePayload = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  answers: {
    goal?: string;
    gender?: string;
    wrist?: string;
    body_type_raw?: string;
    body_type?: string;
    age?: number;
    weight?: number;
    height?: number;
    profession?: string;
    injuries?: string;
    days?: number;
    time?: number;
    equipment?: string[];
  };
};

type ProfileUpdateBody = {
  name?: unknown;
  email?: unknown;
  profession?: unknown;
  age?: unknown;
  weight?: unknown;
  height?: unknown;
  injuries?: unknown;
  goal?: unknown;
  gender?: unknown;
  body_type?: unknown;
  days?: unknown;
  time?: unknown;
  equipment?: unknown;
};

class ProfileValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProfileValidationError";
    this.status = status;
  }
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível carregar seu perfil.", 500);
    }

    const userId = auth.user.id;
    const { data: userRow, error: userError } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();

    if (userError || !userRow) {
      logWarn("PROFILE", "Profile load denied", { user_id: userId, reason: "missing_user_row" });
      return jsonError("Não foi possível carregar seu perfil.", 404);
    }

    const savedAnswers = await getUserAnswersByUserId(supabase, userId);
    const healthConsentGranted = await hasUserConsent(supabase, userId, "health");
    const { data: currentAuthUser } = await supabase.auth.getUser();

    return jsonSuccess(
      buildProfilePayload(
        {
          id: userRow.id,
          name: userRow.name,
          email: currentAuthUser.user?.email ?? auth.user.email ?? ""
        },
        applyHealthConsentToAnswers(savedAnswers, healthConsentGranted)
      )
    );
  } catch {
    return jsonError("Não foi possível carregar seu perfil.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? jsonError("Sua sessão expirou. Faça login novamente.", 401);
    }

    const supabase = createSupabaseUserClient(request);
    if (!supabase) {
      return jsonError("Não foi possível salvar seus dados no momento.", 500);
    }

    const body = (await request.json().catch(() => null)) as ProfileUpdateBody | null;
    if (!body) {
      throw new ProfileValidationError("Não foi possível salvar seus dados no momento.");
    }

    const userId = auth.user.id;
    const { data: userRow, error: userError } = await supabase.from("users").select("id, name").eq("id", userId).maybeSingle();

    if (userError || !userRow) {
      logWarn("PROFILE", "Profile save denied", { user_id: userId, reason: "missing_user_row" });
      return jsonError("Não foi possível salvar seus dados no momento.", 404);
    }

    const currentAnswers = await getUserAnswersByUserId(supabase, userId);
    if (!currentAnswers) {
      logWarn("PROFILE", "Profile save denied", { user_id: userId, reason: "missing_answers" });
      return jsonError("Não foi possível carregar seus dados no momento.", 404);
    }

    const { data: currentAuthUser } = await supabase.auth.getUser();
    const currentEmail = currentAuthUser.user?.email ?? auth.user.email ?? "";
    const healthConsentGranted = await hasUserConsent(supabase, userId, "health");
    const normalizedCurrentAnswers = normalizeExistingAnswers(
      applyHealthConsentToAnswers(currentAnswers, healthConsentGranted)
    );
    const nextEmail = parseEmail(body.email, currentEmail);
    const nextName = parseRequiredText(body.name, "Informe seu nome.");
    const nextGoal = parseEnumValue(body.goal, GOAL_OPTIONS, "Selecione um objetivo válido.");
    const nextGender = parseEnumValue(body.gender, GENDER_OPTIONS, "Selecione um gênero válido.");
    const nextBodyType = parseEnumValue(body.body_type, BODY_TYPE_OPTIONS, "Selecione um biotipo válido.");
    const nextAge = parseNumber(body.age, 12, 80, "Informe uma idade válida.");
    const nextWeight = parseNumber(body.weight, 30, 200, "Informe um peso válido.");
    const nextHeight = parseNumber(body.height, 140, 210, "Informe uma altura válida.");
    const nextDays = parseNumber(body.days, 1, 7, "Informe uma frequência válida.");
    const nextTime = parseTime(body.time);
    const nextProfession = parseText(body.profession);
    const nextInjuries = healthConsentGranted ? parseText(body.injuries) : "";
    const nextEquipment = parseEquipment(body.equipment);
    const bodyTypeFields = normalizeBodyTypeFields({ body_type: nextBodyType });

    if (nextEmail !== currentEmail) {
      const adminSupabase = createSupabaseAdminClient();
      if (!adminSupabase) {
        return jsonError("Não foi possível salvar seus dados no momento.", 500);
      }

      const { error: emailUpdateError } = await adminSupabase.auth.admin.updateUserById(userId, {
        email: nextEmail,
        email_confirm: true
      });

      if (emailUpdateError) {
        logWarn("PROFILE", "Email update failed", { user_id: userId });
        throw new ProfileValidationError(normalizeEmailUpdateError(emailUpdateError.message));
      }
    }

    const nextAnswers = normalizeBodyTypeFields({
      ...normalizedCurrentAnswers,
      goal: nextGoal,
      gender: nextGender,
      age: nextAge,
      weight: nextWeight,
      height: nextHeight,
      profession: nextProfession,
      injuries: nextInjuries,
      days: nextDays,
      time: nextTime,
      equipment: nextEquipment,
      wrist: bodyTypeFields.wrist,
      body_type_raw: bodyTypeFields.body_type_raw,
      body_type: bodyTypeFields.body_type
    }) as QuizAnswers;

    logInfo("PROFILE", "Body type normalized", {
      user_id: userId,
      body_type_raw: nextAnswers.body_type_raw,
      body_type: nextAnswers.body_type
    });

    const { data: updatedUser, error: updateUserError } = await supabase
      .from("users")
      .update({ name: nextName })
      .eq("id", userId)
      .select("id, name")
      .single();

    if (updateUserError || !updatedUser) {
      logError("PROFILE", "User row update failed", { user_id: userId });
      return jsonError("Não foi possível salvar seus dados no momento.", 500);
    }

    const answersResult = await saveUserAnswers(supabase, userId, nextAnswers);
    if (answersResult.error) {
      logError("PROFILE", "User answers update failed", { user_id: userId });
      return jsonError("Não foi possível salvar seus dados no momento.", 500);
    }

    logInfo("PROFILE", "Profile updated", { user_id: userId });

    return jsonSuccess(
      buildProfilePayload(
        {
          id: updatedUser.id,
          name: updatedUser.name,
          email: nextEmail
        },
        nextAnswers
      )
    );
  } catch (error) {
    if (error instanceof ProfileValidationError) {
      return jsonError(error.message, error.status);
    }

    return jsonError("Não foi possível salvar seus dados no momento.", 500);
  }
}

function buildProfilePayload(user: { id: string; name: string; email: string }, answers: Partial<QuizAnswers> | null): ProfilePayload {
  const normalizedAnswers = normalizeExistingAnswers(answers);

  return {
    user,
    answers: {
      goal: normalizedAnswers.goal,
      gender: normalizedAnswers.gender,
      wrist: normalizedAnswers.wrist,
      body_type_raw: normalizedAnswers.body_type_raw,
      body_type: normalizedAnswers.body_type,
      age: normalizedAnswers.age,
      weight: normalizedAnswers.weight,
      height: normalizedAnswers.height,
      profession: normalizedAnswers.profession,
      injuries: normalizedAnswers.injuries,
      days: normalizedAnswers.days,
      time: normalizedAnswers.time,
      equipment: Array.isArray(normalizedAnswers.equipment) ? normalizedAnswers.equipment : []
    }
  };
}

function normalizeExistingAnswers(answers: Partial<QuizAnswers> | null | undefined) {
  if (!answers) {
    return {} as Partial<QuizAnswers>;
  }

  const hasBodyTypeValue = Boolean(answers.body_type || answers.body_type_raw || answers.wrist);
  return hasBodyTypeValue ? normalizeBodyTypeFields(answers) : answers;
}

function parseRequiredText(value: unknown, fallbackMessage: string) {
  const text = parseText(value);

  if (!text) {
    throw new ProfileValidationError(fallbackMessage);
  }

  return text;
}

function parseText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseEmail(value: unknown, currentEmail: string) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : currentEmail.trim().toLowerCase();

  if (!normalized || !isValidEmail(normalized)) {
    throw new ProfileValidationError("Informe um e-mail válido.");
  }

  return normalized;
}

function parseNumber(value: unknown, min: number, max: number, message: string) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ProfileValidationError(message);
  }

  return Math.round(parsed);
}

function parseTime(value: unknown) {
  const parsed = parseNumber(value, 15, 90, "Informe um tempo válido.");

  if (!TIME_OPTIONS.includes(parsed)) {
    throw new ProfileValidationError("Selecione um tempo de treino válido.");
  }

  return parsed;
}

function parseEnumValue<T extends string>(value: unknown, options: readonly T[], message: string) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!options.includes(normalized as T)) {
    throw new ProfileValidationError(message);
  }

  return normalized as T;
}

function parseEquipment(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProfileValidationError("Selecione seus equipamentos.");
  }

  const normalized = Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter((item): item is HomeEquipment => EQUIPMENT_OPTIONS.includes(item as HomeEquipment))
    )
  );

  if (!normalized.length) {
    return ["nenhum"] as HomeEquipment[];
  }

  if (normalized.includes("nenhum")) {
    return ["nenhum"] as HomeEquipment[];
  }

  return normalized as HomeEquipment[];
}

function normalizeEmailUpdateError(message?: string) {
  const normalized = message?.toLowerCase() ?? "";

  if (normalized.includes("already") || normalized.includes("registered")) {
    return "Este e-mail já está em uso.";
  }

  if (normalized.includes("invalid")) {
    return "Não foi possível atualizar o e-mail informado.";
  }

  return "Não foi possível atualizar seu e-mail no momento.";
}
