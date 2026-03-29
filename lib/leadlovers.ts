import "server-only";

import { resolveBodyType } from "@/lib/body-type";
import { logError, logWarn } from "@/lib/server-logger";
import { QuizAnswers } from "@/lib/types";

const LEADLOVERS_MACHINE_CODE = 774503;
const LEADLOVERS_EMAIL_SEQUENCE_CODE = 1838006;
const LEADLOVERS_SEQUENCE_LEVEL_CODE = 1;

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
    logWarn("LEADLOVERS", "LeadLovers not configured");
    return;
  }

  if (!email) {
    logWarn("LEADLOVERS", "Lead skipped because e-mail is missing");
    return;
  }

  const body = {
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

  try {
    const response = await fetch(`https://llapi.leadlovers.com/webapi/lead?token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      logError("LEADLOVERS", "LeadLovers API error", {
        status: response.status,
        message: errorText || response.statusText
      });
    }
  } catch (error) {
    logError("LEADLOVERS", "LeadLovers request failed", {
      error: error instanceof Error ? error.message : "unknown"
    });
  }
}
