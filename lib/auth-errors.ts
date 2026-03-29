export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function getFriendlyAuthErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const normalized = message.toLowerCase();

  if (normalized.includes("already registered") || normalized.includes("already been registered")) {
    return "Este e-mail já está cadastrado.";
  }

  if (normalized.includes("configuração do admin incompleta")) {
    return "A configuração do admin no servidor está incompleta.";
  }

  if (
    normalized.includes("e-mail ou senha de admin inválidos") ||
    normalized.includes("email ou senha de admin invalidos")
  ) {
    return "E-mail ou senha de admin inválidos.";
  }

  if (
    normalized.includes("invalid login credentials") ||
    normalized.includes("credenciais inválidas") ||
    normalized.includes("credenciais invalidas") ||
    normalized.includes("usuário não encontrado") ||
    normalized.includes("usuario nao encontrado")
  ) {
    return "Usuário não encontrado ou credenciais inválidas";
  }

  if (normalized.includes("password should be at least") || normalized.includes("weak password")) {
    return "Sua senha precisa ter pelo menos 6 caracteres.";
  }

  if (normalized.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado.";
  }

  if (normalized.includes("failed to fetch") || normalized.includes("network")) {
    return "Não foi possível conectar ao serviço de autenticação. Verifique rede, domínio autorizado ou CORS.";
  }

  return message || "Não foi possível concluir a autenticação.";
}
