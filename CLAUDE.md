# Instruções para o Claude Code

## Sobre este projeto
- Tipo: Web Fullstack
- Desenvolvedor: Iniciante / Em aprendizado
- Idioma preferido para comunicação: **Português (Brasil)**

---

## Comportamento esperado

### Antes de qualquer mudança
- **Sempre explique o que você vai fazer antes de fazer.** Descreva quais arquivos serão alterados, o motivo, e qual o impacto esperado.
- Se a mudança envolver mais de um arquivo, liste todos eles antes de começar.
- Nunca faça múltiplas alterações de uma vez sem aprovação explícita para cada etapa.

### Linguagem e explicações
- Use linguagem simples e didática. Evite jargões técnicos sem explicação.
- Quando usar um conceito novo (ex: middleware, hook, migration), explique brevemente o que é.
- Prefira exemplos concretos a explicações abstratas.

### Testes
- Após qualquer alteração de código, sugira como testar a mudança (manualmente ou com testes automatizados).
- Se o projeto tiver testes automatizados, indique como rodá-los antes e depois da mudança.
- Nunca considere uma tarefa "concluída" sem indicar como validar que funcionou.

---

## Arquivos protegidos — não alterar sem aprovação explícita

- `.env` e qualquer variável de ambiente
- `package.json` / `package-lock.json` / `yarn.lock`
- Arquivos de configuração de banco de dados
- Arquivos de configuração de deploy (ex: `Dockerfile`, `vercel.json`, `netlify.toml`)
- Qualquer arquivo de autenticação ou segurança

---

## O que **não** fazer

- Não refatore código sem que eu peça explicitamente
- Não instale novas dependências sem me perguntar antes e explicar para que servem
- Não delete arquivos — sempre me consulte primeiro
- Não altere a estrutura de pastas sem aprovação

---

## Fluxo de trabalho preferido

1. Entenda o problema ou pedido
2. Explique o que pretende fazer e por quê
3. Liste os arquivos que serão tocados
4. Aguarde confirmação (se for uma mudança significativa)
5. Faça a alteração de forma incremental
6. Indique como testar o resultado

---

## Dicas para me ajudar melhor

- Se não entender algo no código, pergunte antes de assumir
- Se houver mais de uma forma de resolver, apresente as opções com prós e contras
- Se encontrar um bug ou problema fora do escopo do pedido, me avise mas não corrija sem autorização