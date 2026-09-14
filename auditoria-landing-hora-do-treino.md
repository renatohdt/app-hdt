# Auditoria da Landing Page — Hora do Treino
### UX · SEO · AEO · Links quebrados
Análise feita em 19/08/2026. O que estava ao alcance do código eu **já corrigi** no arquivo `landing-page-melhorada.html`. O que depende do WordPress/Yoast está listado como **ação sua** no fim.

---

## 1. Links quebrados — nenhum encontrado ✅

Testei todos os links da página. Resultado:

| Link | Status |
|---|---|
| `/exercicios-em-casa/` (blog) | OK (200) |
| `app.horadotreino.com.br/criar-conta` | OK — abre o questionário |
| `app.horadotreino.com.br/login` | OK (bloqueia robôs por padrão, o que é normal e correto para login) |
| `app.horadotreino.com.br/premium` | OK — mostra os planos |
| `app.horadotreino.com.br/` | OK |
| Google Play (`com.horadotreino.app`) | OK — app publicado |
| Instagram / TikTok / YouTube | Handles corretos (recomendo um clique de conferência manual, pois redes sociais bloqueiam verificação automática) |

Nenhum link aponta para página inexistente.

---

## 2. UX / Usabilidade — falhas encontradas e corrigidas

**Corrigido no código:**

1. **Acessibilidade dos ícones** — os 18 ícones SVG e os ícones das lojas não tinham marcação para leitores de tela. Adicionei `aria-hidden="true"` e `focusable="false"` em todos (são decorativos, não devem ser lidos em voz alta nem receber foco de tabulação).
2. **Texto alternativo (alt) da imagem do hero** — estava genérico (`"app treino em casa"`). Troquei por um alt descritivo e com palavra-chave: *"App de treino Hora do Treino: tela de treino em casa personalizado por IA"*. Bom para acessibilidade E para o Google Imagens.
3. **Links em azul padrão** — os links dentro do FAQ e do hero apareciam no azul "cara de link cru", destoando da marca. Estilizei no verde Hora do Treino, com sublinhado sutil.
4. **Performance percebida** — adicionei `fetchpriority="high"` na imagem principal do hero (carrega primeiro, melhora o LCP, que o Google mede).

**Recomendações de UX que valem testar (não apliquei para não mudar sua estratégia sem aval):**

- **Prova social mais forte no hero.** Hoje o número de reviews (4) é pequeno. Quando o app tiver nota/volume relevante na Play Store, exiba "⭐ 4,x na Google Play" logo abaixo do botão — é o gatilho de confiança que mais converte em app.
- **CTA fixo no mobile.** Numa página longa, um botão "Criar meu treino" fixo no rodapé do celular costuma subir a conversão. Dá para fazer, é só pedir.
- **Ordem das seções.** A sequência atual (dor → como funciona → recursos → provas → fundador → planos → FAQ) está muito boa. O único teste que sugiro é subir a seção do **fundador** para logo depois de "Como funciona": mostrar o profissional cedo reforça autoridade antes de pedir cadastro.

---

## 3. SEO — potencial de crescer em "app de treino", "aplicativo de treino" e similares

### Palavras-chave alvo (validadas na pesquisa)
Termos que o público realmente busca e que combinam com o produto:

- **Cabeça:** `app de treino`, `aplicativo de treino`
- **Corpo:** `treino personalizado`, `app de musculação`, `aplicativo de musculação`, `app de treino em casa`
- **Cauda longa (alta conversão):** `app de treino em casa grátis`, `aplicativo para montar treino`, `app de treino com IA`, `app de treino para iniciantes`

### O que já corrigi no código para atacar essas keywords
- **H1** mudou de "Seu treino em casa..." para **"O app de treino em casa personalizado em poucos minutos"** — agora carrega a keyword principal no título mais importante da página.
- **Badge** do hero: "Treino personalizado com IA" → **"App de treino com IA"**.
- **Primeira frase (lead)** reescrita como definição com as keywords "app de treino", "exercícios em casa", "personal trainer", "IA" — e o Google/IA valorizam muito o que aparece no início da página.
- **Subtítulo do "Como funciona"** agora inclui **"aplicativo de treino"** de forma natural.
- Distribuí "app de treino", "app de musculação" e "aplicativo de treino" pelo corpo sem encher linguiça (densidade saudável).

### Concorrência (para você saber contra quem briga)
Os apps que aparecem nessas buscas no Brasil: Seven, Nike Training Club, Hevy, Gym WP, SmartGym, MFIT, TecnoFit. **Seu diferencial claro e defensável:** IA + **método de personal trainer com CREF** + foco em casa + 100% em português. É esse ângulo (profissional de verdade por trás) que quase nenhum concorrente tem — explore-o em todo conteúdo.

---

## 4. AEO — aparecer nas respostas de IA (ChatGPT, Gemini, Perplexity, AI Overviews)

AEO é o "novo SEO": otimizar para ser **citado** pelas IAs. As pesquisas confirmam que conteúdo com dados estruturados tem **2,5x mais chance de ser citado**, e que **44% das citações vêm dos primeiros 30% da página**. O que fiz:

1. **Pergunta "O que é o Hora do Treino?"** adicionada no topo do FAQ, com resposta curta, factual e "citável" — exatamente o formato que a IA copia. Isso define a **entidade** da marca de forma inequívoca.
2. **Dados estruturados ampliados** (o fator nº 1 de AEO). A página agora tem **4 blocos de schema válidos**:
   - `SoftwareApplication` — agora com **autor (Renato Santiago, Personal Trainer, CREF)**, criador (a empresa), palavras-chave, lista de recursos e idioma. O sinal de autor com CREF é E-E-A-T puro (experiência/autoridade), que a IA usa para confiar na fonte.
   - `FAQPage` — 6 perguntas (pode virar rich result no Google e resposta direta na IA).
   - `HowTo` — os 3 passos de "como montar seu treino" viram um passo a passo estruturado (ótimo para "como fazer" na busca e na IA).
   - `Organization` — empresa, fundador e redes sociais (`sameAs`), criando o "sinal de consenso" que a IA cruza para recomendar.
3. **Front-loading** — a definição do produto agora está logo no início (hero e primeiro FAQ), onde a IA mais lê.

---

## 5. Ações que dependem de você (nível WordPress/Yoast — não dá para fazer dentro do bloco HTML)

Estas são as de **maior impacto** e só você consegue aplicar no painel:

1. **Título SEO (tag `<title>`) e meta description** — no Yoast/SEO da página. Sugestões prontas:
   - **Título:** `App de Treino em Casa com IA | Hora do Treino` (até ~60 caracteres)
   - **Meta description:** `Monte seu treino em casa personalizado com IA e método de personal trainer. App de treino grátis para começar, disponível na Google Play.` (até ~155 caracteres)
2. **Liberar os robôs de IA no `robots.txt`** — muitos sites bloqueiam sem querer. Garanta que `GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` e `OAI-SearchBot` estão **permitidos**. Sem isso, você não aparece nas IAs.
3. **Imagem do hero mais leve** — a `app-treino-em-casa.webp` está boa; só confirme que nenhuma imagem da página passa de ~150–200 KB (velocidade é fator de ranking).
4. **Links internos** — já incluí um link para o artigo "melhores aplicativos para treinar em casa". Vale linkar essa landing a partir do seu blog (quanto mais páginas internas apontarem para ela, mais o Google entende que é importante).
5. **Nota da Play Store** — quando tiver volume, atualize o `aggregateRating` do schema com a nota real da loja (hoje reflete as 4 avaliações do site).
6. **Frescor** — páginas atualizadas nos últimos 2 meses recebem ~28% mais citações de IA. Revisite esta landing a cada trimestre (nem que seja um ajuste pequeno).

---

## Resumo
- **Links:** nenhum quebrado.
- **UX:** acessibilidade, alt e cor de links corrigidos; melhorias opcionais sugeridas.
- **SEO:** H1, badge, lead e subtítulos agora atacam "app de treino"/"aplicativo de treino".
- **AEO:** 4 schemas válidos (incl. autor com CREF, HowTo e Organization) + definição citável no topo.
- **Sua vez:** título/meta no Yoast, liberar robôs de IA, links internos do blog.
