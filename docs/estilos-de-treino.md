# Especificação — Estilos de Treino

> Fonte da verdade para a feature "Estilo de Treino". Guia o módulo de prompt da IA, os limites de validação e a renderização no app.
> Status: rascunho para revisão (Renato). Criado em 2026-05-31.

---

## 1. Visão geral

O usuário escolhe o **estilo** do treino (a *forma*), enquanto o **objetivo** (emagrecer, hipertrofia, etc.) continua ajustando a *intensidade e o volume* dentro daquela forma. Os dois eixos se multiplicam, não se substituem.

Estilos disponíveis (já existem como `training_styles` no catálogo de exercícios):

- `musculacao` — Tradicional (métodos da musculação, porém feitos em casa)
- `funcional` — Funcional
- `hiit` — HIIT
- `calistenia` — Calistenia

Mais a opção **"Personal Escolhe"**, em que a IA define o estilo pelo objetivo + nível (ver seção 4).

**Modelo premium:** grátis escolhe 1 estilo (ou "Personal Escolhe"); combinar múltiplos estilos no mesmo plano é premium.

---

## 2. O problema atual (estado do código)

Toda a estrutura do treino nasce de um único eixo, o `goalStyle`, em `buildWorkoutStrategy` (`lib/workout-strategy.ts`). O `WORKOUT_SYSTEM_PROMPT` (`lib/workout-ai.ts`) é 100% vocabulário de musculação (ordem compostos→isoladores, tabela de reps por objetivo, descanso 60–90s). O campo `training_styles` do catálogo **não é usado na geração**.

Para um HIIT parecer HIIT, é preciso um segundo eixo — `trainingStyle` — que governe a *forma* do treino ao lado do `goalStyle`, alimentando: `allowedBlockTypes`, descanso, limites de prescrição (`normalizeRepsForBudget`/bounds) e um módulo dedicado no prompt.

---

## 3. O DNA de cada estilo

### Tradicional (`musculacao`)
- **Métrica:** séries × repetições × carga (implícita).
- **Reps:** tabela atual por objetivo/nível (6–20).
- **Descanso:** 60–90s (90s em composto pesado de hipertrofia).
- **Estrutura:** compostos → isoladores, agrupados por músculo.
- **Blocos:** `normal`; bi-set/drop-set para avançados.
- **Renderização:** como hoje.
- **Observação:** é a base. Não muda em relação ao comportamento atual.

### HIIT (`hiit`)
- **Métrica:** tempo e rounds — **não** carga.
- **Trabalho/descanso:** trabalho 20–40s / descanso 10–20s. Razão trabalho:descanso de 2:1 a 1:1 (avançado até 3:1).
- **Formatos:** Tabata (20/10 × 6–8), EMOM, AMRAP, circuito metabólico.
- **Exercícios:** corpo inteiro, explosivos, multiarticulares. Evitar isoladores.
- **Estrutura:** 1 aquecimento → 2–4 rounds de um circuito de 3–5 exercícios. Descanso entre rounds 30–60s.
- **Assinatura inegociável:** descanso curto.
- **Blocos:** `circuit`.
- **Renderização ideal:** cronômetro de rounds (onda B, ver seção 5).

### Calistenia (`calistenia`)
- **Métrica:** dificuldade do movimento + reps/tempo, sem carga externa.
- **Progressão:** por nível — regressão → progressão da mesma habilidade (ex.: flexão inclinada → normal → diamante).
- **Reps/tempo:** reps altas até quase falha + isometrias frequentes (prancha, hold, L-sit; 20–60s).
- **Descanso:** moderado, 45–75s.
- **Estrutura:** padrões empurrar / puxar / perna / core, do mais difícil (skill) ao mais fácil (resistência).
- **Blocos:** `normal` + `isometria`; supersets de antagonistas.
- **Renderização:** cabe no schema atual.

### Funcional (`funcional`)
- **Métrica:** padrões de movimento; mistura reps e tempo.
- **Padrões:** empurrar, puxar, agachar, girar/anti-rotação, carregar/locomover.
- **Características:** multiarticular, muito core e estabilidade unilateral; quase nada de isolamento.
- **Reps/tempo:** 10–15 reps ou tempo; descanso 30–60s.
- **Estrutura:** circuitos de 4–6 padrões, 2–3 voltas.
- **Blocos:** `circuit` / `superset`.
- **Renderização:** cabe no schema atual.

---

## 4. "Personal Escolhe" — decisão em camadas

> **Escopo da lógica:** toda a regra de recomendação/segurança desta seção vale **apenas para o "Personal Escolhe"** (quando o app decide). Se o usuário escolhe o estilo manualmente, a escolha é **livre** — inclusive HIIT para iniciante. Nesse caso, em vez de bloquear, o app entrega uma **versão adaptada** ao nível (ver seção 4.2).

O estilo não vem só do objetivo. A decisão usa **todas as respostas do questionário** em camadas, nesta ordem de precedência:

**Camada 1 — Equipamento (filtro de viabilidade).** Define quais estilos fazem sentido com o material disponível.

| Material disponível | Estilos viáveis / favorecidos |
|---|---|
| Nenhum (só peso corporal) | `calistenia`, `funcional` (bodyweight), `hiit` (bodyweight). Tradicional fica fraco → evitar. |
| Halteres, caneleira, máquina | `musculacao` viável (ganha força). |
| Kettlebell, fitball, fita suspensa, elásticos | `funcional` favorecido. |

> O tradicional rende com carga (halteres/caneleira/máquina); sem isso, perde eficiência. Por isso o equipamento entra **antes** do objetivo.

**Camada 2 — Objetivo × nível (seletor principal).** Entre os estilos viáveis da camada 1, escolhe pela tabela abaixo. Filosofia (Renato): iniciante prioriza segurança e eficiência; HIIT só é desbloqueado com o nível. **Iniciante nunca cai em HIIT.**

| Objetivo (goalStyle)      | Iniciante   | Intermediário      | Avançado          |
|---------------------------|-------------|--------------------|-------------------|
| Emagrecer (fat_loss)      | Tradicional | Funcional          | HIIT              |
| Hipertrofia (hypertrophy) | Tradicional | Tradicional        | Tradicional       |
| Condicionamento (conditioning) | Funcional | Funcional       | HIIT              |
| Recomposição (recomposition)   | Tradicional | Funcional      | Tradicional       |

Quando a camada 1 exclui o estilo da tabela (ex.: tabela diz "Tradicional" mas o usuário não tem material), cai para o substituto viável mais próximo: sem material → `calistenia` (objetivo de força/hipertrofia) ou `funcional` (emagrecer/condicionamento).

**Camada 3 — Tempo e frequência (desempate/ajuste).** Nunca sobrepõe a regra de segurança do iniciante.
- Pouco tempo por sessão (≤30min) ou poucos dias/semana → favorece formatos eficientes e full-body (`hiit`, `funcional`, ou tradicional full body).
- Tempo longo + muitos dias → favorece volume e progressão (`musculacao`, `calistenia`).

> A revisar: confirmar os goalStyles reais (`resolveGoalStyle`) e como cada objetivo do questionário mapeia para esta tabela.

---

## 4.2. Escolha manual e versão adaptada

- A escolha manual de estilo é **livre**, sem restrição por nível. A lógica da seção 4 não bloqueia nada na escolha manual; serve só para o "Personal Escolhe".
- Se um **iniciante** escolher um estilo intenso (ex.: HIIT) manualmente, o app não bloqueia — gera uma **versão adaptada** ao nível: intervalos mais curtos, exercícios menos complexos, mais descanso, e uma nota gentil ("HIIT é intenso — montamos uma versão para quem está começando").
- A adaptação por nível já existe parcialmente via `level` na estratégia; precisa ser estendida para o eixo de estilo.

## 4.3. Recomendação no questionário (UI)

Em vez de o usuário escolher no escuro, o questionário mostra: **"Com base nas suas respostas, recomendamos estes estilos"**, com o estilo mais apropriado **em destaque** (selo "recomendado para você") e uma linha curta de porquê (ex.: "ideal para quem está começando e tem halteres").

Princípios:
- Todos os estilos continuam **selecionáveis** — o destaque sugere, nunca bloqueia ou faz os outros parecerem piores.
- O "porquê" da recomendação reusa a lógica da seção 4 (equipamento + objetivo/nível + tempo).
- É a superfície natural de **upsell**: ali aparece "combinar estilos é Premium", no momento de maior engajamento.
- Layout sugerido: 1 cartão em evidência (recomendado) + os demais estilos disponíveis normalmente.

---

## 4.4. Localização (casa / condomínio / academia) — eixo independente

A localização **não** interfere no estilo: são eixos ortogonais. O estilo é o *método* (um HIIT é um HIIT em qualquer lugar); a localização só muda o *pool de equipamentos e espaço*. O catálogo já trata isso — cada exercício tem o campo `location` e o `matchesLocation` (`lib/workout-strategy.ts`/filtros) já filtra por ele.

Implicações para quando condomínio e academia forem liberados:
- O filtro de estilo continua funcionando sem mudanças; muda só o tamanho do pool de exercícios.
- Na **academia**, o tradicional (`musculacao`) ganha muita força (máquinas, pesos livres). O "Personal Escolhe" pode pender mais para tradicional nesse contexto (alimenta a Camada 1 como "material rico").
- **Cuidado de dados:** cada exercício precisa estar etiquetado corretamente com **localização E estilo** ao mesmo tempo, para um "HIIT de academia" puxar exercícios apropriados àquele local.

---

## 5. Decisão de schema (duas ondas)

**Onda A — dentro do schema atual (começar aqui):** expressar os estilos por convenção com os campos existentes (`blockType: 'circuit'/'isometria'`, `reps` em segundos como `'30s'`, `rest` curto). Zero migração, zero risco para treinos existentes, validação rápida de que a IA gera cada estilo com qualidade.

**Onda B — schema enriquecido (só onde dá retorno visual):** adicionar `sessionFormat` (`'tabata' | 'emom' | 'amrap' | 'circuit' | 'straight_sets'`) e, para blocos cíclicos, `rounds` + `workSeconds`/`restSeconds`. Foco no HIIT, onde a diferença visual mais importa (cronômetro de rounds). Exige migração na tabela `workouts` (campo protegido — requer aprovação) e mudança no front.

Calistenia e funcional vivem bem na onda A; só o HIIT realmente se beneficia da onda B.

---

## 6. Usuários existentes (migração)

- **Não forçar regeneração de ninguém.** Usuários atuais mantêm o treino que têm (na prática, estilo `musculacao`).
- `trainingStyle` entra no `buildWorkoutHash` (cache key). Default dos existentes = `musculacao`.
- O treino novo no estilo escolhido só é gerado quando o usuário **opta** por trocar de estilo ou refaz o questionário.
- Lançar como novidade ativa ("experimente seu treino em um novo estilo"), não como mudança silenciosa.

---

## 7. Guardrails de qualidade

- A normalização atual (`normalizeRepsForBudget`, bounds) precisa **respeitar o estilo**, senão "conserta" um HIIT de volta para musculação.
- Validação por estilo: um HIIT sem descanso curto / sem estrutura cíclica deve ser rejeitado ou re-pedido.
- Antes de lançar: gerar um conjunto de treinos de teste por estilo (1 HIIT, 1 calistenia, 1 funcional) e revisar com olho humano — "isto parece o estilo certo?".
- Catálogo: HIIT × costas tinha só 3 exercícios (auditoria de 2026-05-31); reforçar antes de soltar o HIIT.

---

## 7.1. Backlog de ajustes finos da F2 (observado nos testes)

Itens reportados ao testar o HIIT gerado. Todos vivem na camada de reordenação pós-IA (`structureSessionExercises`/`scoreExerciseOrder`/`enforceCombinedRuns` em `lib/workout-ai.ts`), que ainda não é consciente de estilo.

1. **Circuito não deve repetir grupo grande seguido.** Apareceu circuito com 3 exercícios de perna seguidos — inviável (fadiga, ritmo cai). Estratégia: alternar grupos dentro do circuito (1–2 de perna + core/cardio), dando recuperação local. Frentes: (a) regra no prompt do HIIT proibindo 2–3 seguidos do mesmo grupo grande e mandando intercalar com core/cardio/superior; (b) ordenação HIIT-aware que intercala grupos em vez de agrupar por músculo. Conflito a resolver: o prompt fixo do sistema diz "agrupe exercícios do mesmo músculo lado a lado" — correto p/ musculação, errado p/ HIIT; o módulo de estilo precisa sobrepor.

2. **Circuito "perdido" (de 1 exercício só).** Apareceu 1 exercício marcado como circuito isolado no meio do treino. Causa raiz: `enforceCombinedRuns` (exige ≥3 seguidos p/ circuito, senão rebaixa p/ normal) roda ANTES da reordenação; a reordenação espalha o circuito e não há revalidação depois. Fix: rodar `enforceCombinedRuns` novamente DEPOIS de `structureSessionExercises` (correção de consistência, segura, vale p/ todos os estilos — circuito solto é sempre erro).

3. (Pendente geral) Refinar normalização de **calistenia** e **funcional** (hoje só o HIIT ganhou ajustes profundos de reps-tempo/descanso).

---

## 8. Plano em fases

- **F0 — Auditoria do catálogo.** ✅ Concluída (147 exercícios, cobertura boa por estilo).
- **F1 — Filtro por estilo (1 estilo, grátis).** `trainingStyle` no questionário + catálogo da IA filtra por `training_styles`.
- **F2 — Estrutura por estilo (este doc).** Módulo de prompt por estilo + limites de validação por estilo (onda A).
- **F3 — "Personal Escolhe".** Mapeamento da seção 4.
- **F4 — Multi-estilo premium + paywall.** Estilo atribuído por sessão; gate de conversão.
