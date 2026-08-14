// Geração de novo treino controlada pelo plano do usuário via isPremium() em lib/subscription.ts
// Este flag não bloqueia mais o acesso — a verificação real é feita server-side nas rotas da API.
export const ENABLE_WORKOUT_REGENERATION = true;

// Card "Programas de treino do Renato" na home. Escondido temporariamente até
// existirem programas cadastrados. Trocar para true para reexibir.
export const SHOW_PROGRAMS_HOME_ENTRY = false;
