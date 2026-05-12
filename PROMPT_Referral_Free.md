# Prompt: Sistema de Indicação (Referral) — Hora do Treino
# Apenas usuários Free

> Cole este prompt no Claude (VSCode / Claude Code) para implementar
> o sistema de indicação passo a passo.
> **Implemente uma etapa por vez e aguarde confirmação antes de avançar.**

---

## Contexto do projeto

- Next.js 14 App Router + Supabase + Tailwind CSS + TypeScript
- PWA mobile-first, pasta raiz `Codex/`
- Autenticação via Supabase Auth
- Assinaturas pagas via Stripe (tabela `subscriptions`)
- A função `isPremium` fica em `lib/subscription.ts`
- Página de perfil: `app/perfil/page.tsx`
- Quiz de onboarding: `components/quiz-form.tsx`
- Conquistas: `lib/achievements.ts` + `components/achievement-popup.tsx`

---

## Regras obrigatórias

- **Não altere** `.env`, `next.config.mjs`, `package.json` nem arquivos de deploy
- **Não instale dependências** sem listar o que é e para que serve
- **Não refatore** código fora do escopo de cada etapa
- **Explique o que vai fazer** antes de fazer
- **Liste os arquivos** que serão tocados antes de editar
- **Indique como testar** ao final de cada etapa
- A promoção é **exclusiva para usuários free** — usuários com assinatura Stripe ativa não recebem o prêmio

---

## Visão geral do que será construído

Cada usuário free recebe um **código de indicação único** (ex: `HDT-X7K2`).
Quando **5 novos usuários** se cadastrarem usando esse código (via link ou campo no quiz),
o dono do código ganha **30 dias de Premium gratuito**.

```
Usuário A compartilha link: app.horadotreino.com.br?ref=HDT-X7K2
    ↓
Usuário B se cadastra com o link ou digita o cupom no quiz
    ↓
Sistema conta as indicações do Usuário A
    ↓
No 5º cadastro → seta referral_premium_until = hoje + 30 dias
              → exibe popup de parabéns
              → desbloqueia conquista "Fofoqueiro(a)"
    ↓
Após 30 dias → exibe popup de expiração + botão "Assinar Premium"
```

---

## ETAPA 1 — Migration do banco de dados (Supabase)

**Arquivo a criar:** `supabase/migrations/20260511_referral_system.sql`

Crie a migration com exatamente o conteúdo abaixo.
Não execute — apenas crie o arquivo para eu aplicar manualmente.

```sql
-- ─── Tabela: referral_codes ───────────────────────────────────────────────────
-- Cada usuário tem no máximo um código de indicação.
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code          TEXT NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- Usuário pode ler o próprio código
CREATE POLICY "referral_codes_select_own"
  ON public.referral_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Apenas service_role pode inserir (via API route)
CREATE POLICY "referral_codes_insert_service"
  ON public.referral_codes FOR INSERT
  WITH CHECK (FALSE); -- bloqueado para usuário direto; service_role bypassa RLS

-- ─── Tabela: referral_uses ────────────────────────────────────────────────────
-- Registra cada novo cadastro que usou um código de indicação.
CREATE TABLE IF NOT EXISTS public.referral_uses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT NOT NULL,
  referrer_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (referred_user_id) -- cada novo usuário só pode usar um código
);

ALTER TABLE public.referral_uses ENABLE ROW LEVEL SECURITY;

-- Usuário pode ver quantas indicações fez (linhas onde é o referrer)
CREATE POLICY "referral_uses_select_own"
  ON public.referral_uses FOR SELECT
  USING (auth.uid() = referrer_user_id);

-- ─── Campo na tabela de usuários ──────────────────────────────────────────────
-- Adiciona suporte a premium gratuito por indicação.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_premium_until  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS referral_rewarded_count INTEGER NOT NULL DEFAULT 0;
  -- referral_rewarded_count: quantas vezes já recebeu o prêmio (para evitar duplicatas)
```

**Como testar (etapa 1):**
Aplique a migration no painel do Supabase (SQL Editor) e confirme que as três
estruturas foram criadas sem erros.

---

## ETAPA 2 — Lógica de geração de código único

**Arquivo a criar:** `lib/referral.ts`

Implemente as seguintes funções usando o cliente Supabase service_role
(já disponível em `lib/supabase-admin.ts`):

```typescript
// Gera um código no formato HDT-XXXX (4 chars aleatórios maiúsculos+números)
// Tenta até 5 vezes para evitar colisão (improvável, mas seguro)
export async function getOrCreateReferralCode(userId: string): Promise<string>

// Retorna o código existente do usuário, ou null se não tiver
export async function getReferralCode(userId: string): Promise<string | null>

// Registra o uso de um código quando um novo usuário se cadastra.
// Retorna { success, referrerUserId } ou { success: false, error }
export async function registerReferralUse(
  code: string,
  referredUserId: string
): Promise<{ success: boolean; referrerUserId?: string; error?: string }>

// Conta quantas indicações válidas o usuário tem
export async function getReferralCount(userId: string): Promise<number>

// Concede 30 dias de premium gratuito ao usuário (apenas se for free).
// Verifica antes se já tem Stripe ativo — se tiver, não faz nada.
// Retorna true se concedeu, false se não era elegível ou já tinha prêmio pendente.
export async function grantReferralPremium(userId: string): Promise<boolean>

// Verifica se o usuário tem premium por indicação ainda válido
export async function hasActiveReferralPremium(userId: string): Promise<boolean>
```

A lógica de `grantReferralPremium`:
1. Busca na tabela `subscriptions` — se tiver status `active` ou `past_due`, retorna `false`
2. Busca `referral_premium_until` do usuário — se for data futura, retorna `false` (já tem)
3. Seta `referral_premium_until = now() + interval '30 days'`
4. Incrementa `referral_rewarded_count`
5. Retorna `true`

**Como testar (etapa 2):**
Chame as funções em um script temporário ou via `app/api/test-insert/route.ts`
(já existe no projeto para testes).

---

## ETAPA 3 — Atualizar isPremium para considerar indicação

**Arquivo a alterar:** `lib/subscription.ts`

Atualize a função `isPremium` para também retornar `true` quando
`referral_premium_until` for uma data futura.

Crie uma função auxiliar no mesmo arquivo:

```typescript
// Verifica premium por indicação consultando a tabela users
async function hasReferralPremium(userId: string, client: SupabaseClient): Promise<boolean>
```

E atualize `isPremium` para fazer os dois checks em paralelo com `Promise.all`.

**Atenção:** não altere a assinatura da função `isPremium` — ela deve continuar
recebendo `(userId, userToken?)` e retornando `Promise<boolean>`.

**Como testar (etapa 3):**
Sete manualmente um `referral_premium_until` futuro para um usuário free no
Supabase e confirme que `isPremium` retorna `true` para ele.

---

## ETAPA 4 — APIs de referral

Crie três API routes:

### 4a. GET /api/referral/code
**Arquivo:** `app/api/referral/code/route.ts`

- Autentica o usuário (use o padrão já existente em outras routes do projeto)
- Chama `getOrCreateReferralCode(userId)`
- Chama `getReferralCount(userId)`
- Retorna `{ success: true, data: { code, link, count } }`
  - `link` = `https://app.horadotreino.com.br?ref=${code}`
  - `count` = número de indicações válidas

### 4b. POST /api/referral/register
**Arquivo:** `app/api/referral/register/route.ts`

- Recebe `{ code: string }` no body
- Autentica o usuário (o novo usuário que está se cadastrando)
- Chama `registerReferralUse(code, userId)`
- Se o registro resultou no 5º uso do referrer → chama `grantReferralPremium(referrerUserId)`
- Retorna `{ success: true }` ou `{ success: false, error }`

### 4c. GET /api/referral/status
**Arquivo:** `app/api/referral/status/route.ts`

- Autentica o usuário
- Retorna `{ success: true, data: { referralPremiumUntil, isReferralPremiumActive } }`
- Usado para exibir o popup de expiração

**Como testar (etapa 4):**
Teste com `curl` ou pelo próprio app em desenvolvimento (`npm run dev`).

---

## ETAPA 5 — Campo de cupom no Quiz (última etapa)

**Arquivo a alterar:** `components/quiz-form.tsx`

Adicione na **última etapa do quiz** (após todas as perguntas, antes do botão final)
um campo opcional:

```
─────────────────────────────────
🎁 Tem um cupom de indicação?
[________________________] (input text, placeholder: "Ex: HDT-X7K2")
            (opcional)
─────────────────────────────────
```

- O campo é **opcional** — não bloqueia o avanço
- Converte o valor para MAIÚSCULAS automaticamente enquanto digita
- Após o cadastro ser concluído (usuário já tem `userId`), chame
  `POST /api/referral/register` com o código digitado
- Se a API retornar erro (código inválido, já usado, etc.), **não mostre erro**
  para o usuário — apenas ignore silenciosamente. O cupom é bônus, não deve
  travar o onboarding.

**Como testar (etapa 5):**
Crie dois usuários de teste. Pegue o código do primeiro, use no quiz do segundo.
Confirme que `referral_uses` ganhou uma linha no Supabase.

---

## ETAPA 6 — Card "Compartilhe e Ganhe" na página de perfil

**Arquivo a alterar:** `app/perfil/page.tsx`

Adicione um card dentro da seção `Preferências` (logo após o toggle de
Notificações e antes do link de Privacidade).

**Visual do card:**

```
┌─────────────────────────────────────────┐
│ 🎁  Compartilhe e Ganhe                  │
│                                          │
│  Indique 5 amigos e ganhe                │
│  30 dias de Premium grátis!              │
│                                          │
│  ●●●○○  3 de 5 indicações               │  ← contagem real
│                                          │
│  Seu link:                               │
│  app.horadotreino.com.br?ref=HDT-X7K2   │
│  [📋 Copiar link]  [📤 Compartilhar]     │
│                                          │
│  Ou compartilhe o cupom: HDT-X7K2        │
└─────────────────────────────────────────┘
```

- Busca os dados em `GET /api/referral/code` ao montar o componente
- Botão "Copiar link" copia a URL para o clipboard (igual ao `handleCopy` do `ShareButton`)
- Botão "Compartilhar" abre o painel do `ShareButton` existente
  (`components/share-button.tsx`) com `context="workout"` e uma prop
  `customText` opcional com a frase:
  *"Tô usando o Hora do Treino pra treinar e tô adorando! Usa meu cupom [CODE]
   e comece grátis: [LINK] #horadotreino"*
- Se o usuário **já tiver Premium Stripe ativo**, exibe o card mas com a mensagem:
  *"Você já é Premium! Mas sua indicação ajuda um amigo a descobrir o app 💪
   Compartilhe assim mesmo — cada indicação conta!"* (sem mostrar a contagem)
- Mostre estado de carregamento enquanto a API responde

**Como testar (etapa 6):**
Abra o perfil, confirme que o card aparece, copie o link e verifique que a URL
tem o `?ref=` correto.

---

## ETAPA 7 — Popup de recompensa (5 indicações atingidas)

**Arquivo a criar:** `components/referral-reward-popup.tsx`

Exibido quando o usuário abre o app e acabou de atingir 5 indicações
(primeira vez que `referral_premium_until` foi setado).

**Texto exato da mensagem:**
```
Parabéns! Você falou tanto de mim! 😍
Aqui está seu prêmio!
10 burpees no seu treino...
e 30 dias de Premium! 🎉
```

- Visual similar ao `WorkoutCompletionPopup` (fundo escuro, animação de confete)
- Botão: **"Vou aceitar os burpees! 💪"**
- Após fechar: salvar no `localStorage` a chave `referral_reward_seen_v1 = true`
  para não exibir novamente
- **Onde acionar:** no `dashboard-home-screen.tsx` ou `app/dashboard/page.tsx`,
  verificar via `GET /api/referral/status` se `isReferralPremiumActive === true`
  e `localStorage` não tem a flag — se sim, exibir o popup

**Como testar (etapa 7):**
Sete `referral_premium_until` manualmente para uma data futura no Supabase,
limpe o localStorage e abra o dashboard.

---

## ETAPA 8 — Popup de expiração do premium

**Arquivo a criar:** `components/referral-expiry-popup.tsx`

Exibido quando `referral_premium_until` passou (premium expirou).

**Texto exato:**
```
Seu período Premium acabou...
Queria tanto que você continuasse...🥺
```
- Botão primário: **"Assinar Premium"** → leva para `/premium`
- Botão secundário: **"Agora não"** → fecha o popup
- Salvar flag `referral_expiry_seen_v1 = true` no localStorage após fechar
- **Onde acionar:** mesmo lugar do popup de recompensa — verificar
  `referral_premium_until < now()` E `referral_rewarded_count > 0` E flag não setada

**Como testar (etapa 8):**
Sete `referral_premium_until` para uma data passada no Supabase,
limpe o localStorage e abra o dashboard.

---

## ETAPA 9 — Conquista "Fofoqueiro(a)"

**Arquivo a alterar:** `lib/achievements.ts`

Adicione a conquista ao array `CONSISTENCY_MILESTONES` (ou crie uma categoria
nova `"referral"` se preferir manter separado):

```typescript
{
  id: "referral_reward",
  milestone: 1,
  title: "Fofoqueiro(a) na Hora do Treino",
  description: "Falou tanto da gente ao invés de treinar que merece uma medalha! Espero que tenha falado só coisa boa...né?! Aproveite o Premium!",
  phrase: "Falou tanto da gente ao invés de treinar que merece uma medalha! Espero que tenha falado só coisa boa...né?! Aproveite o Premium!",
  category: "consistency"
}
```

**Quando acionar:** no mesmo momento em que `grantReferralPremium` retorna `true`
(dentro de `POST /api/referral/register`), salve a conquista desbloqueada de
alguma forma para exibir via `AchievementPopup`.

Sugestão: adicione um campo `referral_achievement_unlocked BOOLEAN DEFAULT FALSE`
na tabela `users` (em uma migration separada), e cheque esse campo no dashboard
para exibir o `AchievementPopup` com a conquista de referral.

**Como testar (etapa 9):**
Simule o 5º cadastro e confirme que o `AchievementPopup` com o título
"Fofoqueiro(a) na Hora do Treino" aparece no dashboard.

---

## Resumo dos arquivos por etapa

| Etapa | Arquivos criados | Arquivos alterados |
|-------|-----------------|-------------------|
| 1 | `supabase/migrations/20260511_referral_system.sql` | — |
| 2 | `lib/referral.ts` | — |
| 3 | — | `lib/subscription.ts` |
| 4 | `app/api/referral/code/route.ts` `app/api/referral/register/route.ts` `app/api/referral/status/route.ts` | — |
| 5 | — | `components/quiz-form.tsx` |
| 6 | — | `app/perfil/page.tsx` |
| 7 | `components/referral-reward-popup.tsx` | `app/dashboard/page.tsx` ou `components/dashboard-home-screen.tsx` |
| 8 | `components/referral-expiry-popup.tsx` | mesmo do 7 |
| 9 | — | `lib/achievements.ts` + `app/api/referral/register/route.ts` |

---

## ⚠️ Lembretes finais para o Claude no VSCode

- Sempre pergunte antes de tocar em `lib/subscription.ts` (arquivo crítico)
- Não adicione dependências externas — use apenas o que já está no projeto
- Mantenha o padrão de autenticação das outras API routes (verificar sessão, retornar 401 se não autenticado)
- Use `supabase-admin.ts` para operações server-side que precisam bypassar RLS
- Qualquer operação de escrita no banco deve ser feita via API route (nunca direto do client)
