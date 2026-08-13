// Cálculo de idade do usuário.
//
// Regras de negócio (ver /perfil › Minha Conta):
// 1. Se o usuário informar a DATA DE NASCIMENTO, a idade é calculada a partir
//    dela e sobe sozinha a cada aniversário.
// 2. Se NÃO informar, usamos a idade que ele deu no cadastro e vamos somando os
//    anos que se passaram desde a DATA DE CADASTRO (created_at). Assim a idade
//    também "envelhece" com o tempo, mesmo sem data de nascimento.
//
// Todas as funções são puras (sem efeitos colaterais) e podem rodar tanto no
// servidor quanto no navegador.

/** Quantos anos completos se passaram entre a data ISO informada e hoje. */
export function yearsSince(isoDate: string | null | undefined): number {
  if (!isoDate) return 0;
  const start = new Date(isoDate);
  if (Number.isNaN(start.getTime())) return 0;

  const today = new Date();
  let years = today.getFullYear() - start.getFullYear();
  const monthDiff = today.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < start.getDate())) {
    years -= 1;
  }
  return years > 0 ? years : 0;
}

/** Idade (anos completos) a partir de uma data de nascimento ISO (YYYY-MM-DD). */
export function computeAgeFromBirthDate(birthDate: string | null | undefined): number | null {
  if (!birthDate) return null;
  const age = yearsSince(birthDate);
  // Sanidade: entre 0 e 120 anos.
  return age >= 0 && age <= 120 ? age : null;
}

/**
 * Idade "efetiva" para exibir e usar nos cálculos.
 * - Prioriza a data de nascimento.
 * - Sem data de nascimento, usa a idade base + anos desde o cadastro.
 */
export function computeEffectiveAge(opts: {
  birthDate?: string | null;
  storedAge?: number | null;
  createdAt?: string | null;
}): number | null {
  const fromBirth = computeAgeFromBirthDate(opts.birthDate);
  if (fromBirth != null) return fromBirth;

  if (typeof opts.storedAge === "number" && opts.storedAge > 0) {
    return opts.storedAge + yearsSince(opts.createdAt);
  }

  return null;
}

/**
 * Idade a usar na GERAÇÃO de treino. Mesma regra da exibição:
 * data de nascimento primeiro; sem ela, idade base "envelhecida" pela data de
 * cadastro (quando disponível). Retorna 0 quando não há idade — o gerador já
 * trata 0 como "sem idade informada".
 */
export function resolveWorkoutAge(
  answers: { birth_date?: string | null; age?: number | string | null } | null | undefined,
  createdAt?: string | null
): number {
  const rawAge = answers?.age;
  const storedAge = typeof rawAge === "number" ? rawAge : Number(rawAge);
  const effective = computeEffectiveAge({
    birthDate: answers?.birth_date,
    storedAge: Number.isFinite(storedAge) && storedAge > 0 ? storedAge : null,
    createdAt: createdAt ?? null
  });
  return effective ?? 0;
}

/** Valida e normaliza uma data de nascimento vinda do formulário. */
export function parseBirthDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;

  const age = yearsSince(trimmed);
  // Faixa aceita: 12 a 100 anos (coerente com o restante do app).
  if (age < 12 || age > 100) return null;

  // Guarda sempre no formato YYYY-MM-DD.
  return trimmed.slice(0, 10);
}
