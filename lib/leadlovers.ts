import "server-only";

import { resolveBodyType } from "@/lib/body-type";
import { logError, logInfo, logWarn } from "@/lib/server-logger";
import { QuizAnswers } from "@/lib/types";

const LEADLOVERS_ENDPOINT = "https://llapi.leadlovers.com/webapi/lead";
const LEADLOVERS_MACHINE_CODE = 774503;
const LEADLOVERS_EMAIL_SEQUENCE_CODE = 1838006;
const LEADLOVERS_SEQUENCE_LEVEL_CODE = 1;
const LEADLOVERS_LOOKUP_ATTEMPTS = 5;
const LEADLOVERS_LOOKUP_DELAY_MS = 2000;
const LEADLOVERS_DYNAMIC_FIELDS = {
  gender: {
    id: 117469,
    tag: "Genero",
    type: "single",
    options: {
      male: "Masculino",
      female: "Feminino"
    }
  },
  goal: {
    id: 117470,
    tag: "objetivo",
    type: "single",
    options: {
      lose_weight: "Emagrecimento",
      gain_muscle: "Hipertrofia",
      body_recomposition: "Definição",
      improve_conditioning: "Condicionamento"
    }
  },
  location: {
    id: 117471,
    tag: "localdetreino",
    type: "multiple",
    options: {
      gym: "Academia",
      home: "Em casa",
      condominium: "Condomínio"
    }
  }
} as const;

export async function sendLeadLoversLead({
  email,
  name,
  answers
}: {
  email?: string | null;
  name: string;
  answers: QuizAnswers;
}) {
  const token = process.env.LEADLOVERS_TOKEN?.trim();

  if (!token) {
    logWarn("LEADLOVERS", "LeadLovers not configured", {
      endpoint: LEADLOVERS_ENDPOINT,
      reason: "missing_token"
    });
    return;
  }

  if (!email) {
    logWarn("LEADLOVERS", "Lead skipped because e-mail is missing", {
      endpoint: LEADLOVERS_ENDPOINT,
      reason: "missing_email"
    });
    return;
  }

  const dynamicFields = buildLeadLoversDynamicFields(answers);
  const createBody = {
    MachineCode: LEADLOVERS_MACHINE_CODE,
    EmailSequenceCode: LEADLOVERS_EMAIL_SEQUENCE_CODE,
    SequenceLevelCode: LEADLOVERS_SEQUENCE_LEVEL_CODE,
    Email: email,
    Name: name,
    goal: answers.goal,
    gender: answers.gender,
    body_type: resolveBodyType(answers),
    days: answers.days,
    time: answers.time,
    equipment: Array.isArray(answers.equipment) ? answers.equipment.join(",") : ""
  };

  logInfo("LEADLOVERS", "LeadLovers dynamic fields mapped", {
    dynamic_fields: dynamicFields.map((field) => ({
      id: field.id,
      tag: field.tag,
      type: field.type,
      value: field.value
    }))
  });

  const createResponse = await sendLeadLoversRequest({
    token,
    method: "POST",
    requestLabel: "LeadLovers create lead",
    payload: createBody
  });

  if (!createResponse.ok) {
    return;
  }

  if (!dynamicFields.length) {
    logWarn("LEADLOVERS", "LeadLovers dynamic fields upsert skipped", {
      reason: "no_dynamic_fields_mapped",
      email
    });
    return;
  }

  const leadFound = await waitForLeadLoversLead({ token, email });
  if (!leadFound) {
    logWarn("LEADLOVERS", "LeadLovers dynamic fields upsert skipped", {
      reason: "lead_not_found_after_create",
      email,
      attempts: LEADLOVERS_LOOKUP_ATTEMPTS
    });
    return;
  }

  // POST creates the lead reliably, but the dynamic fields are enriched via PUT.
  const upsertBody = {
    Email: email,
    DynamicFields: dynamicFields.map((field) => ({
      Id: field.id,
      Value: field.value
    }))
  };

  const upsertResponse = await sendLeadLoversRequest({
    token,
    method: "PUT",
    requestLabel: "LeadLovers upsert dynamic fields",
    payload: upsertBody
  });

  if (upsertResponse.ok && !leadLoversResponseMentionsDynamicFields(upsertResponse.responseBody)) {
    logWarn("LEADLOVERS", "LeadLovers response does not confirm dynamic fields persistence", {
      method: "PUT",
      endpoint: LEADLOVERS_ENDPOINT,
      status_code: upsertResponse.statusCode,
      response_body: upsertResponse.responseBody || null,
      note: "The API response omits DynamicFields, so confirmation must be done in the LeadLovers UI."
    });
  }
}

async function sendLeadLoversRequest({
  token,
  method,
  requestLabel,
  payload,
  query
}: {
  token: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  requestLabel: string;
  payload?: unknown;
  query?: Record<string, string>;
}) {
  const endpoint = buildLeadLoversUrl(token, query);

  logInfo("LEADLOVERS", `${requestLabel} started`, {
    endpoint: LEADLOVERS_ENDPOINT,
    method,
    query: query ?? null
  });

  if (typeof payload !== "undefined") {
    logInfo("LEADLOVERS", `${requestLabel} payload`, {
      payload
    });
  }

  try {
    const response = await fetch(endpoint, {
      method,
      headers: {
        ...(typeof payload !== "undefined" ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`
      },
      ...(typeof payload !== "undefined" ? { body: JSON.stringify(payload) } : {})
    });

    const responseBody = await response.text().catch(() => "");

    logInfo("LEADLOVERS", `${requestLabel} response`, {
      endpoint: LEADLOVERS_ENDPOINT,
      method,
      status_code: response.status,
      response_body: responseBody || null
    });

    if (!response.ok) {
      logError("LEADLOVERS", `${requestLabel} failed`, {
        endpoint: LEADLOVERS_ENDPOINT,
        method,
        status_code: response.status,
        response_body: responseBody || response.statusText
      });
    }

    return {
      ok: response.ok,
      statusCode: response.status,
      responseBody
    };
  } catch (error) {
    logError("LEADLOVERS", `${requestLabel} request failed`, {
      endpoint: LEADLOVERS_ENDPOINT,
      method,
      error: error instanceof Error ? error.message : "unknown"
    });

    return {
      ok: false,
      statusCode: null,
      responseBody: null
    };
  }
}

async function waitForLeadLoversLead({
  token,
  email
}: {
  token: string;
  email: string;
}) {
  for (let attempt = 1; attempt <= LEADLOVERS_LOOKUP_ATTEMPTS; attempt += 1) {
    const lookupResponse = await sendLeadLoversRequest({
      token,
      method: "GET",
      requestLabel: "LeadLovers lookup lead",
      query: { email }
    });

    const leadFound = isLeadLoversLeadFound(lookupResponse.responseBody, email);

    logInfo("LEADLOVERS", "LeadLovers lookup lead result", {
      attempt,
      max_attempts: LEADLOVERS_LOOKUP_ATTEMPTS,
      email,
      lead_found: leadFound,
      status_code: lookupResponse.statusCode,
      response_body: lookupResponse.responseBody || null
    });

    if (leadFound) {
      return true;
    }

    if (attempt < LEADLOVERS_LOOKUP_ATTEMPTS) {
      await wait(LEADLOVERS_LOOKUP_DELAY_MS);
    }
  }

  return false;
}

function buildLeadLoversUrl(token: string, query?: Record<string, string>) {
  const url = new URL(LEADLOVERS_ENDPOINT);
  url.searchParams.set("token", token);

  Object.entries(query ?? {}).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  return url.toString();
}

function isLeadLoversLeadFound(responseBody: string | null, email: string) {
  if (!responseBody) {
    return false;
  }

  const parsedResponse = safeParseLeadLoversJson(responseBody);
  if (!parsedResponse || typeof parsedResponse !== "object") {
    return false;
  }

  return "Email" in parsedResponse && parsedResponse.Email === email;
}

function leadLoversResponseMentionsDynamicFields(responseBody: string | null) {
  if (!responseBody) {
    return false;
  }

  const parsedResponse = safeParseLeadLoversJson(responseBody);
  if (!parsedResponse || typeof parsedResponse !== "object") {
    return false;
  }

  return "DynamicFields" in parsedResponse;
}

function safeParseLeadLoversJson(responseBody: string) {
  try {
    return JSON.parse(responseBody) as unknown;
  } catch {
    return null;
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildLeadLoversDynamicFields(answers: QuizAnswers) {
  const fields: Array<{
    id: number;
    tag: string;
    type: "single" | "multiple";
    value: string;
  }> = [];

  const genderValue = LEADLOVERS_DYNAMIC_FIELDS.gender.options[answers.gender];
  if (genderValue) {
    fields.push({
      id: LEADLOVERS_DYNAMIC_FIELDS.gender.id,
      tag: LEADLOVERS_DYNAMIC_FIELDS.gender.tag,
      type: LEADLOVERS_DYNAMIC_FIELDS.gender.type,
      value: genderValue
    });
  } else {
    logWarn("LEADLOVERS", "LeadLovers gender mapping missing", {
      gender: answers.gender
    });
  }

  const goalValue = LEADLOVERS_DYNAMIC_FIELDS.goal.options[answers.goal];
  if (goalValue) {
    fields.push({
      id: LEADLOVERS_DYNAMIC_FIELDS.goal.id,
      tag: LEADLOVERS_DYNAMIC_FIELDS.goal.tag,
      type: LEADLOVERS_DYNAMIC_FIELDS.goal.type,
      value: goalValue
    });
  } else {
    logWarn("LEADLOVERS", "LeadLovers goal mapping missing", {
      goal: answers.goal
    });
  }

  const locationValue = normalizeLeadLoversLocationValue(answers.location);
  if (locationValue.length) {
    fields.push({
      id: LEADLOVERS_DYNAMIC_FIELDS.location.id,
      tag: LEADLOVERS_DYNAMIC_FIELDS.location.tag,
      type: LEADLOVERS_DYNAMIC_FIELDS.location.type,
      // The API schema expects a string value, even for checkbox fields.
      value: locationValue.join(",")
    });
  } else {
    logWarn("LEADLOVERS", "LeadLovers location mapping missing", {
      location: answers.location
    });
  }

  return fields;
}

function normalizeLeadLoversLocationValue(location: QuizAnswers["location"] | Array<QuizAnswers["location"] | string> | string) {
  const normalizedValues = Array.isArray(location) ? location : [location];
  const mappedValues = normalizedValues.reduce<string[]>((accumulator, item) => {
    const mappedValue =
      LEADLOVERS_DYNAMIC_FIELDS.location.options[item as keyof typeof LEADLOVERS_DYNAMIC_FIELDS.location.options];

    if (mappedValue) {
      accumulator.push(mappedValue);
    }

    return accumulator;
  }, []);

  return Array.from(new Set(mappedValues));
}
