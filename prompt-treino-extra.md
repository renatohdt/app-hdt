# Prompt — Feature: Treino Extra (Premium)

## Contexto do projeto
Este é um app Next.js fullstack com Supabase, TypeScript e Tailwind. A geração de treinos usa OpenAI via `lib/workout-ai.ts`. Os treinos são salvos na tabela `workouts` do Supabase. O app já tem sistema de assinatura Premium via Stripe.

---

## Objetivo
Implementar a feature **Treino Extra** — um treino avulso gerado por IA, disponível apenas para usuários Premium, que expira automaticamente após 4 horas.

---

## Escopo completo da implementação

### 1. Migration SQL — `supabase/migrations/YYYYMMDD_extra_workout.sql`

Adicionar coluna `type` na tabela `workouts`:

```sql
alter table public.workouts
  add column if not exists type text not null default 'standard'
  check (type in ('standard', 'extra'));

create index if not exists workouts_type_idx on public.workouts(type);
create index if not exists workouts_user_type_idx on public.workouts(user_id, type);
```

> **Importante:** não alterar a coluna `expires_at` (já existe). O treino extra será salvo com `expires_at = now() + interval '4 hours'`. O job de limpeza já respeita esse campo automaticamente.

---

### 2. API Route — `app/api/workout/extra/route.ts`

Criar uma nova route com dois métodos:

**GET** — verifica se o usuário já tem um treino extra ativo:
- Busca na tabela `workouts` onde `user_id = userId`, `type = 'extra'`, `expires_at > now()`, sem `deleted_at`
- Retorna `{ hasExtraWorkout: boolean, workout: WorkoutPlan | null, expiresAt: string | null }`
- Verificar se o usuário é Premium (tabela `subscriptions` ou campo `is_premium` no usuário)

**POST** — gera um novo treino extra:
- Verificar que o usuário é Premium (retornar 403 se não for)
- Verificar limite mensal: máx. 5 treinos extras por mês (contar registros na tabela `workouts` onde `type = 'extra'` e `created_at >= início do mês corrente`)
- Receber no body:
  ```typescript
  {
    availableMinutes: number;        // 20, 30, 45, 60
    equipment: HomeEquipment[];      // equipamentos disponíveis agora (pode diferir do perfil)
    focusMuscleGroup: string;        // grupo muscular a intensificar
  }
  ```
- Buscar dados do usuário: `user_answers`, `exercises` (catálogo), `user_excluded_exercises`, `workouts` atual (para não repetir)
- Buscar últimas sessões (`workout_session_logs`, últimas 5) para calibrar intensidade
- Chamar `generateWorkoutWithAI` com contexto especial (ver seção 5 abaixo)
- Salvar na tabela `workouts` com:
  - `type = 'extra'`
  - `expires_at = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString()`
  - `hash = null` (treino único, sem cache)
- Retornar o treino gerado + `expiresAt`

---

### 3. Tipo TypeScript adicional — `lib/types.ts`

Adicionar ao arquivo de tipos existente (não criar arquivo novo):

```typescript
export type ExtraWorkoutRequest = {
  availableMinutes: 20 | 30 | 45 | 60;
  equipment: HomeEquipment[];
  focusMuscleGroup: string;
};

export type ExtraWorkoutResponse = {
  hasExtraWorkout: boolean;
  workout: WorkoutPlan | null;
  expiresAt: string | null;
  usedThisMonth: number;
  monthlyLimit: number;
};
```

---

### 4. Componente — `components/ExtraWorkoutButton.tsx`

Botão que fica ao lado das abas de treino (Treino A / B / C). Deve:

**Estado 1 — Usuário FREE:**
- Mostrar botão com ícone ⚡ ou `+` e label "Treino Extra"
- Ao clicar, abrir modal com:
  - Título: "Treino Extra!"
  - Texto: "Tenha um treino extra para quando você estiver treinando em local diferente, com menos tempo, ou quer fazer algo diferente. Este treino é excluído do seu programa de treino após 4hrs."
  - Botão CTA: "Assine o Premium" → redireciona para `/escolher-plano`
  - Botão secundário: "Fechar"

**Estado 2 — Usuário PREMIUM sem treino extra ativo:**
- Mesmo botão, ao clicar abre modal com:
  - Texto de apresentação igual ao acima
  - Botão: "Criar meu Treino Extra!" → abre o questionário (Estado 3)
  - Mostrar discretamente: `X/5 treinos extras usados este mês`

**Estado 3 — Questionário (modal de 3 perguntas):**
- Mostrar em sequência ou tudo de uma vez (preferir tudo de uma vez para ser mais rápido):

  **Pergunta 1:** "Quanto tempo você tem disponível?"
  - Opções: 20 min / 30 min / 45 min / 60 min (botões de seleção)

  **Pergunta 2:** "Que equipamentos você tem agora?"
  - Usar o mesmo formato visual de `/perfil` (chips selecionáveis)
  - Pré-selecionar os equipamentos do perfil do usuário como padrão
  - Opções: HALTERES / ELÁSTICOS / FITBALL / FITA SUSPENSA / CANELEIRA / KETTLEBELL / ROLO ABDOMINAL / NENHUM

  **Pergunta 3:** "Quer intensificar algum grupo muscular?"
  - Usar os grupos musculares do perfil (`focusRegion` expandido)
  - Opções chips: Peitoral / Costas / Ombros / Bíceps / Tríceps / Core / Glúteos / Pernas / Sem preferência
  - Seleção única

- Botão final: "Gerar Treino Extra ⚡"
- Ao clicar: mostrar loading com mensagem "Gerando seu treino personalizado..."
- Ao concluir: fechar modal e exibir o treino extra na tela

**Estado 4 — Treino extra ativo (já existe um):**
- Mostrar badge no botão indicando que há treino extra ativo
- Ao clicar, abrir modal mostrando o treino gerado
- Mostrar countdown de expiração: "Expira em Xh Ymin"
- Botão: "Ver Treino Extra"

---

### 5. Contexto especial para a IA — adicionar em `lib/workout-ai.ts`

Criar uma função `generateExtraWorkoutWithAI` (ou adicionar parâmetro `isExtra: true` na existente) que receba:

```typescript
type ExtraWorkoutContext = {
  availableMinutes: number;
  availableEquipment: HomeEquipment[];
  focusMuscleGroup: string;
  previousWorkout: WorkoutPlan | null;       // treino padrão atual do usuário
  recentSessionKeys: string[];               // últimas sessões completadas
  excludedExerciseIds: string[];
}
```

O prompt para a IA deve incluir instruções adicionais:
- "Este é um treino EXTRA, fora do programa regular. Deve ser completo e independente."
- `"Duração: ${availableMinutes} minutos. Respeite rigorosamente esse tempo."`
- `"Equipamentos disponíveis AGORA: ${availableEquipment}. Use APENAS esses equipamentos."`
- `"Intensificar grupo muscular: ${focusMuscleGroup}"`
- "Evite repetir exercícios do treino regular do usuário: [lista de exercícios do treino atual]"
- "Mantenha o mesmo estímulo e nível de dificuldade do programa regular."

---

### 6. Integração com calendário

Quando o usuário completar o treino extra (chamar `/api/workout/complete`), passar um campo adicional:
```typescript
{ workoutType: 'extra' }
```

Na tabela `workout_session_logs`, o `workout_key` deve ser prefixado com `"extra_"` para identificação visual no calendário.

No componente do calendário (`app/calendario/page.tsx`), adicionar visual diferenciado para sessões com `workout_key` começando com `"extra_"` — por exemplo, um ícone ⚡ ou badge "Extra".

---

## Regras de negócio importantes

### Isolamento do treino regular — CRÍTICO
- O treino extra é **completamente independente** do treino regular do usuário
- **Nada no programa de treino atual deve ser alterado**, nem lido de forma destrutiva:
  - A contagem de sessões do programa (`sessionProgress`) **não é afetada**
  - O ciclo de treino (`planCycleId`) **não muda**
  - O hash do treino regular **não muda**
  - A progressão de Treino A / B / C **não avança** por causa de um treino extra
- O treino extra usa seu próprio `workout_id` na tabela `workouts` (com `type = 'extra'`)
- O treino extra **não deve aparecer** na lógica de `fetchLatestWorkoutRecord` com `scope = 'WORKOUT'` ou `scope = 'AI'` — garantir que essas queries filtrem por `type = 'standard'` (ou ausência de `type = 'extra'`)

### Funcionalidades disponíveis no treino extra
O treino extra é um treino completo e deve suportar as mesmas interações do treino regular:

- ✅ **Check de conclusão:** ao marcar o treino extra como concluído, registrar normalmente em `workout_session_logs` com `workout_id` do treino extra
- ✅ **Contagem de sessões e meta:** o treino extra concluído **conta para a meta do usuário** (`user_goals`) — incrementa o `workoutsDone` normalmente, pois é um treino real realizado
- ✅ **Registro de carga (`exercise_weight_logs`):** o usuário pode registrar o peso usado em cada exercício do treino extra, exatamente como faz no treino regular
- ✅ **Substituição de exercício:** o usuário pode substituir exercícios do treino extra via o fluxo existente (`/api/workout/replace-exercise`), salvando em `workout_exercise_replacements` com o `workout_id` do treino extra
- ✅ **Feedback de sessão (`workout_session_feedbacks`):** o usuário pode avaliar o treino extra normalmente

### Outros
- Apenas usuários Premium podem gerar treinos extras
- Limite: 5 treinos extras por mês (resetar no 1º dia de cada mês)
- Apenas 1 treino extra ativo por vez (bloquear geração se já houver um ativo com `expires_at > now()`)
- Após 4h, o treino some automaticamente (via `expires_at` + job existente) — os `workout_session_logs` e `exercise_weight_logs` associados **permanecem** (não deletar em cascata os registros de histórico)
- O treino extra completado aparece no calendário com visual diferenciado (⚡)
- Rate limit na geração: já coberto pelo rate limiter existente em `lib/rate-limit.ts`

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `supabase/migrations/YYYYMMDD_extra_workout.sql` | CRIAR |
| `app/api/workout/extra/route.ts` | CRIAR |
| `components/ExtraWorkoutButton.tsx` | CRIAR |
| `lib/types.ts` | MODIFICAR (adicionar tipos) |
| `lib/workout-ai.ts` | MODIFICAR (adicionar contexto extra) |
| `app/dashboard/page.tsx` | MODIFICAR (incluir botão Treino Extra) |
| `app/calendario/page.tsx` | MODIFICAR (visual diferenciado para treino extra) |

---

## O que NÃO fazer

- Não modificar a tabela `workout_session_logs`
- Não alterar o fluxo de geração do treino regular
- Não remover a coluna `expires_at` existente
- Não instalar novas dependências sem consultar o desenvolvedor
- Não alterar `.env` ou arquivos de autenticação
- Não deletar nenhum arquivo existente

---

## Como testar após implementar

1. Com usuário FREE: clicar no botão Treino Extra → deve aparecer tela de upsell
2. Com usuário PREMIUM: clicar → preencher questionário → verificar treino gerado
3. Verificar no Supabase: registro em `workouts` com `type = 'extra'` e `expires_at` = now + 4h
4. **Isolamento crítico:** gerar treino extra → verificar que `sessionProgress` do treino regular não mudou, que o ciclo A/B/C não avançou, e que `/api/workout` (GET) continua retornando o treino regular normalmente
5. Completar o treino extra → verificar se aparece no calendário com ícone ⚡
6. Completar o treino extra → verificar se a meta ativa (`user_goals`) teve o `workoutsDone` incrementado
7. No treino extra, registrar carga de um exercício → verificar registro em `exercise_weight_logs`
8. No treino extra, substituir um exercício → verificar registro em `workout_exercise_replacements`
9. Simular expiração (alterar `expires_at` para o passado no Supabase) → verificar que o treino desaparece da tela, mas que os logs de sessão e carga **permanecem** no banco
10. Testar limite mensal: gerar 5 treinos extras → o 6º deve ser bloqueado
11. Testar bloqueio de duplicata: com treino extra ativo, tentar gerar outro → deve bloquear
