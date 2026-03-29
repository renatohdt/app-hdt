export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    throw new Error("Resposta vazia do servidor");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Resposta invalida do servidor");
  }
}

export function getRequestErrorMessage(error: unknown, fallback = "Erro na requisicao") {
  return error instanceof Error ? error.message : fallback;
}
