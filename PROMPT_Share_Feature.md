# Prompt: Feature de Compartilhamento Social — Hora do Treino

> Use este prompt no Claude (VSCode / Claude Code) para implementar ou revisar
> a feature de compartilhamento social no app Hora do Treino.

---

## Contexto do projeto

Projeto Next.js 14 + Supabase + Tailwind CSS. PWA mobile-first. Stack TypeScript.  
Pasta raiz: `Codex/`.  
Componentes ficam em `components/`, utilitários em `lib/`.

---

## O que foi implementado

Foi criado um componente reutilizável `components/share-button.tsx` e ele foi
integrado em dois pontos do app:

1. **`components/workout-completion-popup.tsx`** — popup exibido quando o
   usuário conclui um treino.
2. **`components/achievement-popup.tsx`** — popup exibido quando o usuário
   desbloqueia uma conquista.

---

## Comportamento esperado

### Componente `ShareButton`

Arquivo: `components/share-button.tsx`

- Recebe duas props:
  - `context: "workout" | "achievement"` — define qual conjunto de frases usar.
  - `achievementTitle?: string` — opcional; quando fornecido, é prefixado na
    frase da conquista.

- Exibe um botão "Compartilhar" que, ao ser clicado, abre um painel com quatro
  opções:
  - **Threads** → abre `https://www.threads.net/intent/post?text=...`
  - **X (Twitter)** → abre `https://twitter.com/intent/tweet?text=...`
  - **Facebook** → abre `https://www.facebook.com/sharer/sharer.php?u=...`
  - **Copiar texto** → copia o texto para a área de transferência.

- Cada plataforma recebe uma URL com parâmetros UTM diferentes:
  ```
  https://app.horadotreino.com.br
    ?utm_source=<threads|twitter|facebook>
    &utm_medium=<workout|achievement>
    &utm_campaign=social_share
  ```

### Frases para treino concluído

```
Treino feito, missão comprida! Comprida mesmo, achei que nunca ia acabar! #horadotreino
Treino feito! Tá Pago! O treino, porque o app eu uso free mesmo! hahaha #horadotreino
No app da Hora do Treino diz que se você treina e posta vale o dobro. Eu duvido, mas tá aí! #horadotreino
Só tem duas coisas boas no treino, quando acaba e o resultado! #horadotreino
Treino feito! Na Hora do Treino tava dizendo que agora eu posso tomar duas cervejas... ahh não é cerejas ¬¬ #horadotreino
```

### Frases para conquistas

```
Acabei de desbloquear uma conquista no Hora do Treino! Tô me sentindo o Thor da academia. #horadotreino
Conquista desbloqueada! Agora só falta o shape do Hemsworth 😂 #horadotreino
Nova conquista no Hora do Treino! O app reconhece meu esforço. Minha família, nem tanto. #horadotreino
Consegui uma conquista! Treino não tá fácil, mas recompensa tá vindo! #horadotreino
```

---

## Tarefas para o Claude no VSCode

Use as instruções abaixo conforme o que precisar fazer:

---

### TAREFA A — Verificar e testar o componente `ShareButton`

```
Leia o arquivo `components/share-button.tsx` e confirme:

1. As cinco frases de treino estão presentes no array WORKOUT_SHARE_PHRASES?
2. As quatro frases de conquista estão presentes em ACHIEVEMENT_SHARE_PHRASES?
3. A função `buildUTMUrl` gera URLs corretas com os três parâmetros UTM:
   utm_source, utm_medium e utm_campaign=social_share?
4. As funções `shareToX`, `shareToFacebook` e `shareToThreads` abrem as
   janelas com `window.open(..., "_blank", "noopener,noreferrer")`?
5. O `handleCopy` usa `navigator.clipboard.writeText`?
6. A prop `achievementTitle` é prefixada na frase quando fornecida?

Se algum item estiver errado, corrija sem mudar a estrutura geral do arquivo.
```

---

### TAREFA B — Verificar integração no WorkoutCompletionPopup

```
Leia o arquivo `components/workout-completion-popup.tsx` e confirme:

1. O import `import { ShareButton } from "@/components/share-button"` existe?
2. O componente `<ShareButton context="workout" />` está renderizado APÓS
   a frase engraçada e ANTES do fechamento do card (div interna)?
3. Ele tem uma div com animação `wcp-fade-up` ao redor, com delay de 0.5s?

Se algum item estiver incorreto, faça o ajuste mínimo necessário.
Não mude as animações existentes nem a estrutura de partículas.
```

---

### TAREFA C — Verificar integração no AchievementPopup

```
Leia o arquivo `components/achievement-popup.tsx` e confirme:

1. O import `import { ShareButton } from "@/components/share-button"` existe?
2. O componente `<ShareButton context="achievement" achievementTitle={achievement.title} />`
   está renderizado ANTES do botão "Valeu! 💪"?
3. A prop `achievementTitle` está passando `achievement.title` corretamente?

Se algum item estiver incorreto, faça o ajuste mínimo necessário.
Não altere o botão "Valeu! 💪" existente nem o layout de troféu.
```

---

### TAREFA D — Adicionar mais frases (expansão futura)

```
No arquivo `components/share-button.tsx`:

Adicione as seguintes frases ao array correto (não substitua as existentes):

Para WORKOUT_SHARE_PHRASES, acrescente:
- "Mais um treino no bolso! O Hora do Treino registrou, então aconteceu. #horadotreino"
- "Treino concluído! Agora começa a parte difícil: fingir que tô descansando. #horadotreino"

Para ACHIEVEMENT_SHARE_PHRASES, acrescente:
- "Missão cumprida! O Hora do Treino sabe o que eu valho, mesmo que a balança discorde. #horadotreino"

Não altere nenhuma outra parte do arquivo.
Liste as linhas modificadas ao final.
```

---

### TAREFA E — Ajuste visual do ShareButton (se necessário)

```
No arquivo `components/share-button.tsx`, ajuste o visual do botão principal
de "Compartilhar" para combinar melhor com o popup de conquista (fundo escuro,
borda verde primária):

- Border: `border-primary/30` em vez de `border-white/10`
- Background: `bg-primary/10` em vez de `bg-white/5`
- Texto: `text-primary` em vez de `text-white/80`
- Hover: `hover:bg-primary/20` em vez de `hover:bg-white/10`

Aplique a mudança APENAS na className do botão principal (primeiro <button>
dentro do return do componente ShareButton).
Não mexa nos outros estilos do arquivo.
```

---

## Regras gerais para o Claude seguir neste projeto

- **Não altere arquivos de configuração** (`.env`, `next.config.mjs`, etc.) sem
  pedir confirmação explícita.
- **Não instale dependências** sem listar o que é e para que serve.
- **Não refatore código** fora do escopo da tarefa pedida.
- **Explique brevemente** o que vai fazer antes de fazer.
- **Liste os arquivos** que serão tocados antes de editar.
- **Indique como testar** ao final de cada mudança.

---

## Como testar manualmente

1. Rode o projeto: `npm run dev`
2. Faça login e complete um treino → o popup de conclusão deve aparecer com o
   botão **Compartilhar** abaixo da frase engraçada.
3. Clique em **Compartilhar** → um painel com Threads, X, Facebook e
   "Copiar texto" deve aparecer.
4. Clique em cada opção → deve abrir a janela da rede social correta (ou
   copiar para o clipboard).
5. Desbloqueie uma conquista (ex.: complete o primeiro treino) → o popup de
   conquista deve aparecer com o botão **Compartilhar** acima de "Valeu! 💪".
6. Verifique que a URL compartilhada contém `utm_source`, `utm_medium` e
   `utm_campaign=social_share`.
