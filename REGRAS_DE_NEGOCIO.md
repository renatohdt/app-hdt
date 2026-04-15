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
- Substituição de exercício: **máximo 2x por programa de treino**
- [Adicionar outros limites aqui, ex: geração de treinos, etc.]

Funcionalidades **não disponíveis** no plano gratuito:
- Geração de novos treinos (ilimitada)
- Evolução de treino com IA
- [Adicionar outras restrições aqui]

### 2.2 Plano Premium

Inclui tudo do plano gratuito, mais:
- Substituição de exercício 2 por treino (2 para treino A, 2 para treino B...)
- Geração de novos treinos **ilimitada**
- Evolução de treino com IA
- [Adicionar outros benefícios premium aqui]

**Periodicidade de cobrança:**
- Mensal — R$ [valor] /mês
- Anual — R$ [valor] /ano (equivalente a R$ [valor] /mês)

---

## 3. Geração de Treino com IA

- O treino é gerado com base nas respostas do formulário inicial do usuário
- A IA utiliza apenas os exercícios cadastrados pelo administrador
- A IA segue as regras de treino definidas pelo administrador
- O treino gerado é personalizado por: [ex: objetivo, nível, equipamentos disponíveis, frequência semanal]
- Usuários premium podem solicitar a geração de um novo treino a qualquer momento
- Usuários freemium [definir regra: ex. podem gerar 1 treino por mês / apenas no cadastro]

---

## 4. Substituição de Exercício

- Usuários **freemium**: até **2 substituições por treino**
- Usuários **premium**: substituições **ilimitadas**
- A substituição é feita pela IA, respeitando o grupo muscular e nível do exercício original
- [Definir se substituição reseta ao gerar novo treino]

---

## 5. Evolução de Treino com IA

- Disponível **apenas para usuários premium**
- A IA analisa o histórico do usuário (cargas, frequência, desempenho) para sugerir progressão
- [Definir periodicidade: ex. sugestão de evolução a cada 4 semanas]

---

## 6. Pagamentos

- Plataforma de pagamento: [ex: Stripe / Hotmart / Mercado Pago]
- Cobrança recorrente automática (mensal ou anual)
- Em caso de falha no pagamento: [definir comportamento — ex: 3 tentativas, depois downgrade para freemium]
- Upgrade de plano: efeito imediato
- Downgrade de plano: efeito no próximo ciclo de cobrança

---

## 7. Cancelamento e Reembolso

- O usuário pode cancelar a assinatura a qualquer momento pela plataforma
- Após o cancelamento, o acesso premium permanece até o fim do período pago
- **Reembolso garantido em até 7 dias** após a contratação, sem necessidade de justificativa
- Após 7 dias, não há reembolso proporcional

---

## 8. Conta do Usuário

- Cadastro via: [ex: e-mail e senha / Google / Apple]
- Um e-mail só pode estar associado a uma conta
- [Definir política de exclusão de conta]
- [Definir política de inatividade]

---

## 9. Administração

- O administrador pode cadastrar, editar e remover exercícios do banco
- O administrador pode atualizar as regras de treino utilizadas pela IA
- Alterações no banco de exercícios afetam apenas os **novos treinos gerados**, não os treinos já existentes dos usuários
- [Definir quem tem acesso administrativo]

---

## 10. Pendências / A Definir

- [ ] Preços dos planos mensal e anual
- [ ] Limite de geração de treinos para usuários freemium
- [ ] Comportamento em caso de falha no pagamento
- [ ] Plataforma de pagamento
- [ ] Método de login/cadastro
- [ ] Política de exclusão de conta
- [ ] Periodicidade da evolução de treino com IA
- [ ] Reset do contador de substituições ao gerar novo treino
