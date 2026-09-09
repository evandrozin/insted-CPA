# Roadmap de Desenvolvimento

Cinco fases. **A Fase 3 já é um sistema utilizável em produção** — se o calendário apertar, é possível rodar um ciclo real com o que existe ao fim dela (relatórios saem em CSV bruto e o app mobile fica para o ciclo seguinte).

Estimativas para **2 desenvolvedores full-stack**. Sprints de 2 semanas.

---

## Fase 1 — Fundação e Cadastros *(3 semanas)*

**Objetivo:** ter a base acadêmica populada e o acesso funcionando.

| # | Entrega | Detalhe |
|---|---|---|
| 1.1 | Monorepo, Docker Compose, CI | Postgres + Redis + Mailhog, lint/test no PR |
| 1.2 | Schema Prisma + migração inicial + seed | Já entregue neste repositório |
| 1.3 | Auth completo | Login por RA/matrícula **ou** e-mail, JWT + refresh rotativo, troca de senha obrigatória no 1º acesso, "esqueci minha senha" |
| 1.4 | RBAC | `RolesGuard` + `ScopeGuard` + `@CurrentUser()` |
| 1.5 | CRUD acadêmico | Campus, Departamentos, Cursos, Disciplinas, Turmas, Salas |
| 1.6 | CRUD de usuários | Filtros, paginação, ativação/desativação |
| 1.7 | Importação CSV/XLSX | Upload → job BullMQ → **dry-run com pré-visualização de erros** antes de confirmar |
| 1.8 | Vínculos | Matrículas (aluno↔turma) e alocações docentes (professor↔disciplina↔turma) |
| 1.9 | Shell do admin em Next.js | Layout, navegação, tabelas, autenticação |

**Critério de aceite:** importar a planilha real de um curso (≈40 alunos, 6 disciplinas) e ver todos os vínculos corretos na tela.

> ⚠️ **Risco número 1 do projeto.** A qualidade dos dados de alocação determina se o aluno vê os professores certos. Comece a coletar as planilhas da secretaria **na semana 1**, não na Fase 3.

---

## Fase 2 — Motor de Formulários e Períodos *(3 semanas)*

**Objetivo:** a CPA consegue montar o questionário sem depender do desenvolvedor.

| # | Entrega | Detalhe |
|---|---|---|
| 2.1 | CRUD de `FormTemplate` / `QuestionBlock` / `Question` | Todos os 6 tipos de questão |
| 2.2 | Editor visual de formulário | Drag-and-drop de blocos e questões, editor de escala Likert com rótulos |
| 2.3 | Configuração de alvo por bloco | `targetType` + `repetivel`, com explicação em linguagem clara ("uma cópia por professor do aluno") |
| 2.4 | Pré-visualização | Renderiza o wizard como o aluno verá, com dados fictícios |
| 2.5 | Publicação e versionamento | Congela o formulário e grava o `snapshot` |
| 2.6 | CRUD de `EvaluationPeriod` | Datas, público, k-anonimato, mensagens de boas-vindas/conclusão |
| 2.7 | Abertura/fechamento agendado | Cron + `PeriodStatus`, com botão de abrir/fechar manual |
| 2.8 | **Geração de tasks e alvos** | Job que materializa `EvaluationTask` + `EvaluationTaskTarget` para todos os respondentes |
| 2.9 | Log de auditoria | Interceptor gravando toda ação de admin |

**Critério de aceite:** montar o questionário oficial da CPA na interface, abrir um período de teste e ver as tasks geradas com os alvos corretos por aluno.

---

## Fase 3 — Fluxo de Resposta Web · 🎯 **MVP** *(3 semanas)*

**Objetivo:** ciclo completo ponta a ponta. **Aqui o sistema pode ir ao ar.**

| # | Entrega | Detalhe |
|---|---|---|
| 3.1 | `GET /me/tasks` | Pendências e concluídas do período ativo |
| 3.2 | `GET /me/tasks/:id/form` | Formulário já resolvido com os alvos do respondente |
| 3.3 | Autosave de rascunho | `PATCH /draft` com debounce de 800 ms, otimista no cliente |
| 3.4 | Submissão anonimizada | Transação: cria `ResponseSet`+`Answer`, apaga rascunhos, marca task `CONCLUIDA`; `Idempotency-Key` |
| 3.5 | **Wizard de resposta** | Passo a passo por bloco, barra de progresso, cards visuais de professor, navegação por teclado, layout responsivo |
| 3.6 | Validação e revisão | Bloqueia avanço com obrigatória vazia; tela de revisão final antes de enviar |
| 3.7 | Tela de conclusão | Mensagem configurada pela CPA |
| 3.8 | Painel de adesão | % de resposta ao vivo por curso/turma — o que a CPA olha todo dia durante a janela |
| 3.9 | Exportação bruta CSV | Saída mínima para a CPA trabalhar em planilha se necessário |

**Critério de aceite:** um aluno real completa a avaliação no celular pelo navegador, em menos de 5 minutos, e a resposta chega ao banco **sem qualquer vínculo com sua identidade**.

---

## Fase 4 — Relatórios e Analytics *(3 semanas)*

**Objetivo:** transformar respostas em decisão institucional.

| # | Entrega | Detalhe |
|---|---|---|
| 4.1 | Motor de agregação | `AggregateSnapshot`: médias, desvio padrão, distribuição por bloco/curso/professor/departamento |
| 4.2 | Guarda de k-anonimato | Retorna `"insuficiente"` abaixo do mínimo configurado — em **toda** rota de relatório |
| 4.3 | Dashboard da CPA | Adesão, média geral, ranking por bloco, comparativo entre cursos, série histórica entre períodos |
| 4.4 | Relatório por curso/coordenação | Escopo do gestor |
| 4.5 | Portal do professor | O docente vê **apenas o próprio** resultado, comparado à média do curso (nunca ao colega) |
| 4.6 | Moderação de comentários | Fila de textos livres; aprovar/ocultar antes de liberar ao docente |
| 4.7 | Exportação PDF | Puppeteer, com identidade visual da Insted, pronto para o relatório do MEC |
| 4.8 | Exportação Excel | ExcelJS, múltiplas abas, dados agregados |

**Critério de aceite:** gerar o relatório institucional completo do ciclo de teste em PDF e Excel, e validar que nenhum professor consegue ver o resultado de outro.

---

## Fase 5 — App Mobile e Engajamento *(4 semanas)*

**Objetivo:** adesão. É o app que tira a avaliação de 30% para 70%+ de resposta.

| # | Entrega | Detalhe |
|---|---|---|
| 5.1 | Base Expo | expo-router, tema, cliente de API, sessão segura (SecureStore) |
| 5.2 | Login e home de pendências | Cards com prazo restante |
| 5.3 | Wizard mobile | Carrossel por swipe, Likert em botões grandes, progresso persistente |
| 5.4 | **Rascunho offline** | MMKV + fila de sincronização — responder no ônibus, sincronizar depois |
| 5.5 | Push notifications | Expo Push: abertura do ciclo, lembrete a 3 dias, lembrete no último dia |
| 5.6 | E-mails transacionais | Mesmos gatilhos, para quem não instalou o app |
| 5.7 | Publicação | EAS Build + submissão à App Store e Play Store |
| 5.8 | Acessibilidade e polimento | Contraste, leitor de tela, fontes ampliadas |

**Critério de aceite:** app aprovado nas duas lojas e um ciclo real conduzido majoritariamente pelo mobile.

> A submissão às lojas leva de 3 a 10 dias úteis (a Apple é imprevisível). Inicie o processo de conta de desenvolvedor institucional na **Fase 1** — é burocracia com CNPJ, não código.

---

## Linha do tempo

```
Semana:  1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16
Fase 1  ████████████
Fase 2              ████████████
Fase 3                          ████████████   ← MVP em produção (sem 12)
Fase 4                                      ████████████
Fase 5                                                  ████████████████
```

**MVP funcional na semana 9. Sistema completo na semana 16.**

## Sugestão de sequenciamento com o calendário acadêmico

Encaixe a Fase 3 para terminar **pelo menos 4 semanas antes** da janela de avaliação do semestre: é o tempo necessário para importar dados reais, rodar um piloto com uma turma e corrigir o que aparecer. Abrir um ciclo institucional em software estreando no mesmo dia é o caminho mais curto para queimar a confiança dos alunos no instrumento.
