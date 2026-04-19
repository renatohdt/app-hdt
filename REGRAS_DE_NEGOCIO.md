# Regras de Negócio — Hora do Treino
> App: [app.horadotreino.com.br](https://app.horadotreino.com.br)  
> Última atualização: abril de 2026

---

## 1. Visão Geral do Produto

O Hora do Treino é um SaaS de geração de treinos personalizados com IA. O usuário preenche um formulário com seus dados e objetivos, e a IA monta um treino personalizado com base em:
- Banco de exercícios cadastrados pelo administrador
- Regras de treino definidas pelo administrador
- Respostas do formulário do usuário

---

## 2. Planos e Acesso

### 2.1 Plano Gratuito (Freemium)

Ferramentas disponíveis sem custo:
- Visualização do treino gerado
- Frequência de treino
- Metas
- Controle de carga
- Cronômetro

Funcionalidades com limite de uso:
- Substituição de exercício: **máximo 2x por programa de treino** (zera a cada novo programa)
- Programas de treino: **máximo 2 programas no total**
  - Programa 1: gerado no cadastro
  - Programa 2: gerado automaticamente ao concluir o Programa 1
  - Ao concluir o Programa 2: exibir upsell para o premium (ver Seção 8)

Funcionalidades **não disponíveis** no plano gratuito:
- Geração de novos programas de treino após o 2º
- Evolução de treino com IA

**Não haverá período de trial gratuito do premium.** O plano free já oferece valor suficiente para o usuário experimentar o app.

### 2.2 Plano Premium

Inclui tudo do plano gratuito, mais:
- Substituição de exercício **ilimitada** por programa de treino
- Geração de novos programas de treino **ilimitada** (novo programa gerado automaticamente ao concluir o atual)
- Evolução de treino com IA
- **Experiência sem anúncios** (anúncios do Google AdSense são exibidos apenas no plano gratuito)

**Preços:**
- Mensal — **R$ 14,90/mês** (cartão de crédito)
- Anual — **R$ 118,80/ano** = R$ 9,90/mês (cartão de crédito ou PIX)

**Estratégia de precificação:** O plano anual representa 33% de desconto e é o foco principal de conversão. O argumento de venda é que a desistência média em atividade física acontece por volta de 3 meses — o plano anual protege o usuário de pagar mais caro por mês e garante continuidade.

---

## 3. Programas de Treino e Geração com IA

- O treino é gerado com base nas respostas do formulário inicial do usuário
- A IA utiliza apenas os exercícios cadastrados pelo administrador
- A IA segue as regras de treino definidas pelo administrador
- O treino gerado é personalizado por: objetivo, nível, equipamentos disponíveis, frequência semanal

### Ciclo de um programa de treino

1. Usuário conclui todas as sessões do programa atual
2. O app exibe: *"Programa de treino concluído! Parabéns! Um novo treino será montado para novos estímulos!"*
3. Um novo programa é gerado automaticamente pela IA
4. O contador de substituições de exercício é zerado

### Regras por plano

- Usuários **premium**: ciclo de geração é **ilimitado** — sempre receberão um novo programa ao concluir o atual
- Usuários **freemium**: recebem **até 2 programas** (1 no cadastro + 1 após concluir o primeiro)
  - Ao concluir o 2º programa, ao invés de gerar um novo, o app exibe o gatilho de upsell (ver Seção 8)

---

## 4. Substituição de Exercício

- Usuários **freemium**: até **2 substituições por programa de treino**
- Usuários **premium**: substituições **ilimitadas**
- A substituição é feita pela IA, respeitando o grupo muscular e nível do exercício original
- O contador de substituições **zera automaticamente** quando um novo programa de treino é gerado

---

## 5. Evolução de Treino com IA

- Disponível **apenas para usuários premium**
- A IA analisa o histórico do usuário (cargas, frequência, desempenho) para sugerir progressão
- [Definir periodicidade: ex. sugestão de evolução a cada 4 semanas]

---

## 6. Pagamentos

- **Plataforma:** Stripe
- **Métodos aceitos:**
  - Plano mensal: cartão de crédito
  - Plano anual: cartão de crédito ou PIX
- Cobrança recorrente automática (mensal ou anual)
- Upgrade de plano: efeito imediato
- Downgrade de plano: efeito no próximo ciclo de cobrança
- O gerenciamento da assinatura (trocar cartão, cancelar, ver histórico) será feito **dentro do próprio app** (não via portal externo do Stripe)

### 6.1 Falha no Pagamento

- O Stripe realizará **3 tentativas automáticas** de cobrança em caso de falha
- O usuário será notificado por e-mail a cada tentativa falha
- Após a 3ª tentativa sem sucesso: downgrade automático para o plano freemium
- O acesso premium é mantido até a última tentativa falhar

### 6.2 Dados Coletados no Checkout

Para fins de emissão futura de Nota Fiscal (manualmente pelo administrador), o checkout coletará:
- Nome completo
- CPF
- E-mail

A emissão de nota fiscal será feita de forma manual pelo administrador em uma etapa futura do produto.

### 6.3 Cupons e Promoções

Funcionalidade adiada para uma fase futura. Será implementada após análise de viabilidade financeira.

---

## 7. Cancelamento e Reembolso

- O usuário pode cancelar a assinatura a qualquer momento dentro do app
- Após o cancelamento, o acesso premium permanece até o fim do período pago
- **Reembolso garantido em até 7 dias** após a contratação, sem necessidade de justificativa (direito de arrependimento — CDC)
- Após 7 dias, não há reembolso proporcional

---

## 8. Gatilhos de Upsell (Free → Premium)

Os momentos em que o usuário free verá o incentivo para assinar o premium:

1. **Home do app** — banner ou destaque permanente com benefícios do premium

2. **Substituição de exercício** — ao tentar substituir um 3º exercício, exibir:
   > *"Seja Premium e substitua exercícios sem limite"*

3. **Perfil / Gerar novo treino** — o botão de gerar novo treino ficará visível mas bloqueado para usuários free, com CTA para o premium

4. **Conclusão do 2º programa de treino** — gatilho de maior intenção de conversão: usuário está motivado, acabou de completar um ciclo. Exibir:
   > *"Parabéns, você completou seu programa de treino! 🎉 Para continuar evoluindo com um novo treino personalizado, assine o Premium."*
   
   Este é o gatilho de **maior potencial de conversão** pois ocorre no pico de motivação do usuário.

---

## 9. Rastreamento e Analytics

### 9.1 Eventos a rastrear

- **Checkout iniciado** — ao clicar em "assinar"
- **Compra concluída** — disparado na página `/checkout/success` (server-side para evitar disparo duplo)
- **Plano selecionado** — mensal vs. anual

### 9.2 Ferramentas de rastreamento

- Google Analytics 4 (evento `purchase`)
- Meta Pixel (evento `Purchase`)
- Google Ads (conversão de compra)

### 9.3 Páginas de checkout

- `/premium` ou `/checkout` — página de apresentação e seleção de plano
- `/checkout/success` — confirmação de pagamento + disparo de todos os eventos de conversão
- `/checkout/cancel` — para usuários que desistiram durante o checkout

---

## 10. Conta do Usuário

- Cadastro via: [ex: e-mail e senha / Google / Apple]
- Um e-mail só pode estar associado a uma conta
- [Definir política de exclusão de conta]
- [Definir política de inatividade]

---

## 11. Administração

- O administrador pode cadastrar, editar e remover exercícios do banco
- O administrador pode atualizar as regras de treino utilizadas pela IA
- Alterações no banco de exercícios afetam apenas os **novos treinos gerados**, não os treinos já existentes dos usuários
- [Definir quem tem acesso administrativo]

---

## 12. Pendências / A Definir

- [ ] Periodicidade da evolução de treino com IA (sugestão: a cada 4 semanas ou ao concluir programa)
- [ ] Método de login/cadastro (e-mail+senha / Google / Apple)
- [ ] Política de exclusão de conta
- [ ] Política de inatividade
- [ ] Quem tem acesso administrativo
- [ ] Emissão de Nota Fiscal (fase futura — dados já serão coletados no checkout)
- [ ] Cupons e promoções (fase futura)
