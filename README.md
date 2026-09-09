# Insted CPA — Sistema de Avaliação Institucional

Plataforma web + mobile para os ciclos de avaliação da Comissão Própria de Avaliação
do Insted Centro Universitário.

## Documentação

| Documento | Conteúdo |
|---|---|
| [Arquitetura](docs/01-arquitetura.md) | Stack, estrutura de pastas, decisões técnicas, RBAC |
| [Roadmap](docs/02-roadmap.md) | 5 fases até o sistema completo, MVP na fase 3 |
| [API](docs/03-api.md) | Endpoints REST por módulo |
| [Schema](packages/database/prisma/schema.prisma) | Modelo de dados (Prisma / PostgreSQL) |
| [Identidade visual](docs/04-identidade-visual.md) | Paleta, tipografia e logo — herdadas do Insted Hub Digital |
| [Integração JACAD](docs/05-integracao-jacad.md) | Contrato da API acadêmica e importação de dados |
| [Questionários atuais](docs/06-questionarios-atuais.md) | Análise dos formulários da CPA 2025 e o que muda na migração |
| [Modalidade e abrangência](docs/07-modalidade-e-abrangencia.md) | EAD × presencial e ciclos que cobrem vários semestres |
| [Autenticação e JACAD](docs/08-autenticacao-jacad.md) | Por que o aluno não usa a senha do JACAD, e o caminho de SSO |

## Stack

NestJS · PostgreSQL 16 + Prisma 6 · Next.js 15 + Tailwind + shadcn/ui · React Native (Expo) · BullMQ + Redis · JWT com RBAC

## Como rodar

```bash
npm install
cp .env.example .env
npm run infra:up          # postgres + redis + mailpit
npm run db:migrate
npm run db:seed
npm run dev
```

| Serviço | URL |
|---|---|
| API | http://localhost:3333 (`/docs` para o Swagger) |
| Admin web | http://localhost:3000 |
| Prisma Studio | `npm run db:studio` |
| Caixa de e-mail (dev) | http://localhost:8025 |

## Importar dados do JACAD

```bash
npm run jacad -- sync tudo --periodo=<id>
npm run jacad -- promover --periodo=<id>
```

Detalhes e limitações em [docs/05-integracao-jacad.md](docs/05-integracao-jacad.md).

## Ciclo de avaliação

```bash
npm run alvos -- periodos                  # ciclos cadastrados
npm run alvos -- gerar --periodo=<id>      # gera tarefas e cards
npm run alvos -- previa --ra=<matrícula>   # o que ESTE aluno vai ver
```

O ciclo é **anual** e configurado pelo painel, em **Ciclos anuais**.

**Acessos do seed** — senha `Insted@2026` para todos:
`cpa@insted.edu.br` (admin) · `marina.duarte@insted.edu.br` (coordenação) · `ana.lima@insted.edu.br` (professor) · `20260001` (aluno)

## Estrutura

```
apps/api        NestJS — API REST, jobs, regras de negócio
apps/admin      Next.js — painel da CPA + fluxo de resposta na web
apps/mobile     Expo — app do aluno e do professor
packages/database   Schema Prisma, migrations, seed
packages/shared     DTOs zod e tipos compartilhados
packages/ui         Componentes e tokens de design
infra/          Docker Compose e pipelines
```

## O princípio que orienta o código

**O anonimato do respondente é estrutural, não configurável.**

`EvaluationTask` guarda *quem respondeu*. `ResponseSet` guarda *o que foi respondido*.
Não existe chave, join ou índice que reconstrua o vínculo entre as duas — nem para
o administrador, nem para quem tiver acesso direto ao banco.

Qualquer alteração que aproxime essas duas tabelas precisa ser tratada como mudança
de política institucional, não como decisão técnica.
