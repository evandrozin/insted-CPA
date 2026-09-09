# Esboço da API REST

**Base:** `https://api.cpa.insted.edu.br/v1`
**Auth:** `Authorization: Bearer <access_token>` em tudo, exceto `/auth/login`, `/auth/refresh` e `/auth/forgot-password`.
**Documentação viva:** Swagger em `/docs` (gerado pelos decorators do NestJS).

Convenções:
- Listagens paginadas: `?page=1&limit=20&search=&sort=nome:asc` → `{ data: [], meta: { total, page, limit, totalPages } }`
- Erros: RFC 7807 — `{ type, title, status, detail, errors?: [{ field, message }] }`
- Datas: ISO 8601 em UTC.

Legenda de acesso: 🔴 ADMIN · 🟠 GESTOR · 🔵 PROFESSOR · 🟢 ALUNO · ⚪ autenticado

---

## 1. Autenticação

| Método | Rota | Acesso | Descrição |
|---|---|:--:|---|
| POST | `/auth/login` | — | `{ identificador, senha }` — aceita RA, matrícula ou e-mail. Retorna `{ accessToken, refreshToken, user, senhaProvisoria }` |
| POST | `/auth/refresh` | — | Rotaciona o refresh token (o antigo é revogado) |
| POST | `/auth/logout` | ⚪ | Revoga o refresh token do dispositivo |
| POST | `/auth/forgot-password` | — | Envia link por e-mail |
| POST | `/auth/reset-password` | — | `{ token, novaSenha }` |
| POST | `/auth/change-password` | ⚪ | Obrigatório quando `senhaProvisoria = true` |
| GET | `/auth/me` | ⚪ | Perfil, papel e vínculos do usuário logado |
| POST | `/auth/push-token` | ⚪ | Registra o token Expo do dispositivo |

---

## 2. Cadastros acadêmicos 🔴

Todos seguem o padrão REST completo — `GET /` (lista), `POST /` (cria), `GET /:id`, `PATCH /:id`, `DELETE /:id` (soft delete):

```
/campi          /departments      /courses      /subjects
/rooms          /academic-terms   /classes
```

Rotas adicionais relevantes:

| Método | Rota | Descrição |
|---|---|---|
| GET | `/courses/:id/classes` | Turmas do curso |
| GET | `/classes/:id/students` | Alunos matriculados |
| GET | `/classes/:id/assignments` | Alocações docentes da turma |
| PATCH | `/academic-terms/:id/activate` | Define o semestre corrente |

## 3. Usuários 🔴

| Método | Rota | Descrição |
|---|---|---|
| GET | `/users` | `?role=ALUNO&status=ATIVO&courseId=&search=` |
| POST | `/users` | Cria com senha provisória e dispara e-mail |
| PATCH | `/users/:id` | |
| PATCH | `/users/:id/status` | Ativa / desativa / bloqueia |
| POST | `/users/:id/reset-password` | Gera nova senha provisória |
| GET | `/users/:id/allocations` | Turmas e disciplinas do usuário |

## 4. Vínculos e alocações 🔴

| Método | Rota | Descrição |
|---|---|---|
| POST | `/enrollments` | Matricula aluno em turma |
| POST | `/enrollments/bulk` | `{ classId, studentIds[] }` |
| DELETE | `/enrollments/:id` | |
| GET | `/teaching-assignments` | `?termId=&teacherId=&classId=` |
| POST | `/teaching-assignments` | Professor + disciplina + turma + semestre (+ sala) |
| PATCH | `/teaching-assignments/:id` | |
| DELETE | `/teaching-assignments/:id` | |
| POST | `/student-subjects/bulk` | Optativas, DPs e turmas mescladas |

## 5. Importação 🔴

| Método | Rota | Descrição |
|---|---|---|
| POST | `/imports` | `multipart/form-data`: `{ tipo, arquivo }`. Retorna `importJobId` |
| GET | `/imports/:id` | Status e progresso do job |
| GET | `/imports/:id/preview` | **Dry-run:** o que será criado/atualizado e a lista de erros por linha |
| POST | `/imports/:id/confirm` | Aplica de fato |
| GET | `/imports/:id/errors.csv` | Relatório de erros para download |
| GET | `/imports/templates/:tipo` | Baixa a planilha modelo |

---

## 6. Formulários 🔴

| Método | Rota | Descrição |
|---|---|---|
| GET | `/forms` | `?publico=ALUNO&status=PUBLICADO` |
| POST | `/forms` | Cria template em rascunho |
| GET | `/forms/:id` | Formulário completo, com blocos e questões aninhados |
| PATCH | `/forms/:id` | Bloqueado se `status = PUBLICADO` |
| POST | `/forms/:id/publish` | Congela e grava o snapshot |
| POST | `/forms/:id/duplicate` | Cria a versão seguinte a partir desta |
| GET | `/forms/:id/preview` | Renderização com alvos fictícios |
| POST | `/forms/:id/blocks` | `{ titulo, ordem, targetType, repetivel }` |
| PATCH | `/forms/:id/blocks/:blockId` | |
| DELETE | `/forms/:id/blocks/:blockId` | |
| PATCH | `/forms/:id/blocks/reorder` | `{ ordens: [{ id, ordem }] }` |
| POST | `/blocks/:blockId/questions` | `{ enunciado, tipo, config, opcoes[] }` |
| PATCH | `/questions/:id` | |
| DELETE | `/questions/:id` | |
| PATCH | `/blocks/:blockId/questions/reorder` | |

## 7. Períodos de avaliação 🔴

| Método | Rota | Descrição |
|---|---|---|
| GET | `/periods` | |
| POST | `/periods` | `{ nome, termId, abreEm, fechaEm, minimoRespostasExibicao }` |
| GET | `/periods/:id` | |
| PATCH | `/periods/:id` | |
| POST | `/periods/:id/forms` | Vincula formulário ao período por público |
| DELETE | `/periods/:id/forms/:periodFormId` | |
| POST | `/periods/:id/generate-tasks` | **Materializa tasks e alvos.** Idempotente — pode reexecutar se novos alunos forem importados |
| GET | `/periods/:id/tasks-preview` | Quantas tasks e alvos serão gerados, por público |
| POST | `/periods/:id/open` | Abertura manual |
| POST | `/periods/:id/close` | Encerra e dispara o cálculo dos agregados |
| POST | `/periods/:id/publish-results` | Libera relatórios para gestores e professores |
| GET | `/periods/:id/adhesion` | Adesão ao vivo: `?groupBy=curso\|turma\|turno` |
| POST | `/periods/:id/remind` | Dispara lembrete aos pendentes |

---

## 8. Respostas — aluno e professor 🟢🔵

O núcleo do produto. Mesmas rotas para web e mobile.

| Método | Rota | Descrição |
|---|---|---|
| GET | `/me/tasks` | Pendências do respondente: `[{ id, periodo, formulario, status, progresso, prazo }]` |
| GET | `/me/tasks/:id` | Metadados + mensagem de boas-vindas |
| GET | `/me/tasks/:id/form` | **Formulário resolvido**: blocos, questões e os alvos já materializados deste usuário — o app monta o wizard direto disto |
| GET | `/me/tasks/:id/draft` | Rascunho salvo (retomar de outro dispositivo) |
| PATCH | `/me/tasks/:id/draft` | **Autosave.** `{ respostas: [{ questionId, targetRefId, valor }] }`. Upsert em lote, aceita envio parcial |
| POST | `/me/tasks/:id/submit` | Submissão final. Header `Idempotency-Key` obrigatório |
| GET | `/me/history` | Períodos anteriores em que participou (sem as respostas) |

**Exemplo — `GET /me/tasks/:id/form`**

```jsonc
{
  "taskId": "…",
  "periodo": { "nome": "Avaliação Institucional 2026.1", "fechaEm": "2026-05-30T23:59:59Z" },
  "progresso": 40,
  "etapas": [
    {
      "blockId": "blk_1",
      "titulo": "Bloco 1 — Infraestrutura",
      "targetType": "INFRAESTRUTURA",
      "alvos": [{ "targetRefId": null, "rotulo": "Insted — Campus Sede" }],
      "questoes": [
        {
          "id": "q_1",
          "enunciado": "As salas de aula são adequadas às atividades?",
          "tipo": "LIKERT",
          "obrigatoria": true,
          "config": { "min": 1, "max": 5,
                      "labels": { "1": "Péssimo", "5": "Excelente" },
                      "permiteNaoSeAplica": true }
        }
      ]
    },
    {
      "blockId": "blk_4",
      "titulo": "Bloco 4 — Avaliação Docente",
      "targetType": "PROFESSOR_DISCIPLINA",
      "repetivel": true,
      "alvos": [
        { "targetRefId": "ta_88", "rotulo": "Ana Lima",   "subtitulo": "Banco de Dados",   "concluido": true  },
        { "targetRefId": "ta_91", "rotulo": "Carlos Reis", "subtitulo": "Engenharia de Software", "concluido": false }
      ],
      "questoes": [ /* aplicadas a cada alvo */ ]
    }
  ]
}
```

**Exemplo — `POST /me/tasks/:id/submit`**

```jsonc
{
  "respostas": [
    { "blockId": "blk_1", "targetRefId": null,
      "itens": [{ "questionId": "q_1", "valorNumerico": 4 }] },
    { "blockId": "blk_4", "targetRefId": "ta_88",
      "itens": [{ "questionId": "q_9",  "valorNumerico": 5 },
                { "questionId": "q_12", "valorTexto": "Excelente didática." }] }
  ]
}
```
→ `201 { "status": "CONCLUIDA", "concluidaEm": "…", "mensagem": "Obrigado por participar!" }`

Erros previstos: `409 TASK_ALREADY_SUBMITTED` · `422 REQUIRED_QUESTION_MISSING` · `403 PERIOD_CLOSED`

---

## 9. Relatórios 🔴🟠🔵

Toda rota aplica o filtro de k-anonimato: alvos com menos de `minimoRespostasExibicao` retornam `{ "status": "insuficiente", "totalRespostas": n }` no lugar das médias.

| Método | Rota | Acesso | Descrição |
|---|---|:--:|---|
| GET | `/reports/periods/:id/overview` | 🔴🟠 | Adesão, média geral, média por bloco |
| GET | `/reports/periods/:id/by-block` | 🔴🟠 | `?courseId=` — médias e distribuição por bloco |
| GET | `/reports/periods/:id/by-course` | 🔴 | Comparativo entre cursos |
| GET | `/reports/periods/:id/by-department` | 🔴 | Biblioteca, secretaria, financeiro… |
| GET | `/reports/periods/:id/teachers` | 🔴🟠 | Lista de docentes com médias (gestor: só o seu curso) |
| GET | `/reports/periods/:id/teachers/:teacherId` | 🔴🟠🔵 | Detalhe por questão + comparativo com a média do curso. 🔵 restrito ao próprio id |
| GET | `/reports/periods/:id/questions/:questionId` | 🔴🟠 | Distribuição de uma questão |
| GET | `/reports/periods/:id/comments` | 🔴 | Textos livres pendentes de moderação |
| PATCH | `/reports/comments/:answerId/moderate` | 🔴 | `{ acao: "APROVAR" \| "OCULTAR", motivo? }` |
| GET | `/reports/historical` | 🔴🟠 | Série histórica: `?scope=CURSO&refId=&periods=4` |
| POST | `/reports/periods/:id/recalculate` | 🔴 | Recalcula os `AggregateSnapshot` |

## 10. Exportação 🔴🟠

| Método | Rota | Descrição |
|---|---|---|
| POST | `/exports/periods/:id/pdf` | `{ escopo, refId?, incluirComentarios }` → job; retorna `exportId` |
| POST | `/exports/periods/:id/xlsx` | Múltiplas abas: geral, por bloco, por curso, por docente |
| POST | `/exports/periods/:id/raw-csv` | Microdados **já anonimizados** — para análise externa |
| GET | `/exports/:exportId` | Status; quando pronto retorna URL assinada (expira em 15 min) |

## 11. Notificações ⚪

| Método | Rota | Descrição |
|---|---|---|
| GET | `/me/notifications` | `?status=NAO_LIDA` |
| PATCH | `/me/notifications/:id/read` | |
| POST | `/notifications/broadcast` | 🔴 `{ periodId, publico, canal, titulo, corpo }` |

## 12. Auditoria e saúde 🔴

| Método | Rota | Descrição |
|---|---|---|
| GET | `/audit-logs` | `?entidade=&userId=&from=&to=` |
| GET | `/health` | Liveness (público) |
| GET | `/health/ready` | Postgres, Redis e filas |
