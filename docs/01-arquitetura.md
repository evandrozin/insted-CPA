# Arquitetura — Sistema de Avaliação Institucional CPA

## 1. Decisão de topologia: monorepo

**Recomendação: monorepo único** (Turborepo + npm workspaces).

Justificativa para este projeto específico:

| Critério | Monorepo | Repos separados |
|---|---|---|
| Tipos compartilhados (DTOs de questionário são complexos e mudam junto) | ✅ um único `packages/shared` | ❌ versionamento npm privado, defasagem |
| Time pequeno (1–4 devs) | ✅ um PR altera API + web + app | ❌ 3 PRs coordenados |
| Deploy independente | ✅ Turborepo filtra por app (`--filter=admin`) | ✅ |
| Onboarding | ✅ um clone, um `npm install` | ❌ |

O risco clássico do monorepo (CI lento) é irrelevante nesta escala.

## 2. Stack

| Camada | Escolha | Por quê |
|---|---|---|
| **API** | NestJS 11 + TypeScript | Modularidade por domínio, DI, Guards/Interceptors nativos para RBAC e auditoria, OpenAPI automático. O motor de formulários dinâmicos ganha muito com módulos bem isolados. |
| **ORM / DB** | Prisma 6 + PostgreSQL 16 | Tipagem end-to-end, migrations versionadas, `Json` nativo para configuração dinâmica de questões. |
| **Admin Web** | Next.js 15 (App Router) + Tailwind + shadcn/ui | SSR para relatórios pesados, React Server Components reduzem payload nas tabelas grandes. |
| **App Mobile** | React Native + Expo (SDK 54) + EAS | iOS + Android com um código; **Expo Updates** permite corrigir o app durante o período de avaliação sem passar pela review das lojas — crítico numa janela de 15 dias. |
| **Fila / Jobs** | BullMQ + Redis | Importação CSV, envio de e-mails/push, cálculo de agregados, abertura/fechamento automático de período. |
| **Auth** | JWT (access 15 min) + Refresh Token rotativo em tabela | Stateless na API, revogação real no logout. |
| **Storage** | S3 / Cloudflare R2 | Planilhas de importação e PDFs gerados. |
| **Observabilidade** | Pino + Sentry | — |

**Web de resposta:** o aluno responde pelo próprio Next.js (rota `/(respondente)`), não por um terceiro app. O app mobile consome exatamente a mesma API.

## 3. Estrutura de pastas

```
insted-cpa/
├── apps/
│   ├── api/                        # NestJS
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── common/             # guards, decorators, filters, pipes
│   │   │   │   ├── guards/         # JwtAuthGuard, RolesGuard, PeriodOpenGuard
│   │   │   │   ├── decorators/     # @Roles(), @CurrentUser()
│   │   │   │   └── interceptors/   # AuditInterceptor, TransformInterceptor
│   │   │   ├── config/             # env validation (zod)
│   │   │   ├── database/           # PrismaService, PrismaModule
│   │   │   ├── jobs/               # BullMQ processors
│   │   │   │   ├── import.processor.ts
│   │   │   │   ├── notification.processor.ts
│   │   │   │   ├── aggregate.processor.ts
│   │   │   │   └── period-scheduler.service.ts   # @Cron abre/fecha período
│   │   │   └── modules/
│   │   │       ├── auth/
│   │   │       ├── users/
│   │   │       ├── academic/       # campus, cursos, turmas, disciplinas, salas
│   │   │       ├── allocations/    # matrículas + alocações docentes
│   │   │       ├── imports/        # CSV/XLSX
│   │   │       ├── forms/          # templates, blocos, questões
│   │   │       ├── periods/        # ciclos, abertura/fechamento
│   │   │       ├── tasks/          # geração de pendências + alvos
│   │   │       ├── responses/      # rascunho + submissão anonimizada
│   │   │       ├── reports/        # agregações, k-anonimato
│   │   │       ├── exports/        # PDF (Puppeteer) e XLSX (ExcelJS)
│   │   │       └── notifications/
│   │   └── test/
│   │
│   ├── admin/                      # Next.js 15
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/login/
│   │   │   │   ├── (admin)/
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── cadastros/  # cursos, turmas, disciplinas, salas, usuários
│   │   │   │   │   ├── alocacoes/
│   │   │   │   │   ├── formularios/[id]/editor/
│   │   │   │   │   ├── periodos/
│   │   │   │   │   └── relatorios/
│   │   │   │   └── (respondente)/  # fluxo de resposta na web
│   │   │   │       ├── avaliacoes/
│   │   │   │       └── avaliacoes/[taskId]/wizard/
│   │   │   ├── components/         # ui/ (shadcn), forms/, charts/, wizard/
│   │   │   ├── lib/                # api-client, auth, react-query
│   │   │   └── hooks/
│   │   └── public/
│   │
│   └── mobile/                     # Expo
│       ├── app/                    # expo-router
│       │   ├── (auth)/login.tsx
│       │   ├── (tabs)/index.tsx    # pendências
│       │   ├── (tabs)/perfil.tsx
│       │   └── avaliacao/[taskId].tsx   # wizard/carrossel
│       ├── src/
│       │   ├── components/
│       │   ├── store/              # zustand + persistência offline (MMKV)
│       │   ├── services/           # api, sync de rascunhos
│       │   └── theme/
│       └── app.json
│
├── packages/
│   ├── database/                   # ÚNICA fonte de verdade do schema
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/index.ts            # exporta PrismaClient + tipos
│   ├── shared/                     # contratos compartilhados API ↔ web ↔ app
│   │   └── src/
│   │       ├── dtos/               # schemas zod (validação e inferência)
│   │       ├── enums/
│   │       └── utils/              # cálculo de progresso, formatadores
│   └── ui/                         # design tokens + componentes web reutilizáveis
│
├── infra/
│   ├── docker-compose.yml          # postgres + redis + mailhog (dev)
│   ├── Dockerfile.api
│   └── github/workflows/
│
├── docs/
├── turbo.json
├── .claude/launch.json             # dev server do painel
└── package.json
```

## 4. Decisões arquiteturais críticas

### 4.1 Anonimato por construção (não por convenção)

Este é o requisito que mais influencia o schema. A abordagem ingênua — `Answer.userId` + um flag `anonimo` filtrado na query — falha no primeiro `SELECT` mal escrito, no primeiro dump de banco e em qualquer auditoria séria.

A solução adotada **separa fisicamente** as duas informações:

```
EvaluationTask                        ResponseSet
├── respondentId  ← QUEM             ├── (sem FK de usuário)
├── status                           ├── targetType / teacherId / courseId
└── concluidaEm                      ├── respondentRole / respondentCourseId
                                      └── respondentClassId   ← só o RECORTE
      "Fulano respondeu"                    "Alguém do 3º de ADS respondeu isto"
```

Não existe coluna, join ou índice que reconstrua o vínculo. O rascunho (`DraftAnswer`) é a única estrutura identificável, e é **destruído na submissão**, dentro da mesma transação que cria os `ResponseSet`.

Camadas complementares:
- **k-anonimato na exibição:** `EvaluationPeriod.minimoRespostasExibicao` (padrão 5). Alvos abaixo do limiar retornam `"insuficiente"` em vez de média — impede identificar o único aluno que avaliou uma optativa de 3 pessoas.
- **Textos livres:** passam por moderação antes de chegar ao professor (podem conter autoidentificação).
- **Ordem embaralhada:** `ResponseSet` gerados em ordem aleatória na submissão, para que `submetidoEm` + sequência não permita correlação.

### 4.2 Motor de formulários dinâmico

O ponto delicado do requisito "definir dinamicamente a quem a pergunta se aplica" é resolvido em duas etapas:

1. **Definição** (admin): `QuestionBlock.targetType` + `repetivel`. Um bloco `PROFESSOR_DISCIPLINA / repetivel=true` significa "aplique estas questões a cada professor do respondente".
2. **Materialização** (na abertura do período): o serviço de tasks resolve as alocações reais de cada usuário e grava `EvaluationTaskTarget` — a lista concreta e ordenada de cards que o wizard vai exibir.

Materializar na abertura, e não a cada request, dá três ganhos: o app carrega a lista instantaneamente, mudanças de alocação no meio do ciclo não alteram um questionário já iniciado, e o cálculo de progresso vira uma simples contagem.

### 4.3 Versionamento imutável de formulários

Ao publicar (`FormStatus.PUBLICADO`), o formulário é congelado e um `snapshot` JSON é gravado. Editar exige criar nova versão. Sem isso, comparar 2026.1 com 2026.2 seria inválido — e a CPA precisa de série histórica defensável perante o MEC.

### 4.4 Idempotência da submissão

Três barreiras: `@@unique([periodFormId, respondentId])` na task, transição de status `EM_ANDAMENTO → CONCLUIDA` verificada dentro da transação, e header `Idempotency-Key` no `POST /submit` (o app mobile pode reenviar em rede instável).

## 5. RBAC

| Recurso | ADMIN | GESTOR | PROFESSOR | ALUNO |
|---|:--:|:--:|:--:|:--:|
| Cadastros e importações | CRUD | leitura do escopo | — | — |
| Formulários e períodos | CRUD | leitura | — | — |
| Responder | — | — | ✅ próprio | ✅ próprio |
| Relatórios institucionais | ✅ | escopo | — | — |
| Resultado individual do docente | ✅ | do seu curso | ✅ só o próprio | — |
| Identificar respondente | ❌ **ninguém** | ❌ | ❌ | ❌ |

Implementado com `RolesGuard` (perfil) + `ScopeGuard` (o gestor só enxerga cursos que coordena, via `Course.coordenadorId`).

## 6. Ambientes

- **Dev:** `npm run infra:up` (Postgres + Redis + Mailpit) e `npm run dev`.
- **Homologação:** dados anonimizados de produção; obrigatória para ensaio do ciclo antes de abrir para os alunos.
- **Produção:** API em container (Railway/Render/AWS ECS), admin na Vercel, Postgres gerenciado com PITR. Backup obrigatório **antes** de abrir e **logo após** encerrar cada período.
