import { repairPtBrText } from "@/lib/pt-br-text";

export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    throw new Error("Resposta vazia do servidor.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Resposta inválida do servidor.");
  }
}

export function getRequestErrorMessage(error: unknown, fallback = "Erro na requisição.") {
  if (error instanceof Error) {
    return repairPtBrText(error.message) || fallback;
  }

  return repairPtBrText(String(error ?? "")) || fallback;
}
