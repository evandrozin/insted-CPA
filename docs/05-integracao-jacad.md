# Integração JACAD

Os dados acadêmicos do CPA vêm do **JACAD**, a mesma API que o Insted Hub Digital
já consome. Este documento registra o contrato real da API — extraído de
`app/Services/Jacad/` do Hub — e como o CPA o utiliza.

## Contrato da API

| Item | Valor |
|---|---|
| Base | `https://insted-developer.jacad.com.br` |
| Autenticação | `POST /api/v1/auth/token` com header **`token: <chave>`** → `{ token, expiresIn }` |
| Chamadas seguintes | header **`Authorization: <access token>`** — **sem** o prefixo `Bearer` |
| Paginação | `pageSize` + `currentPage` (base 0); resposta `{ elements: [], page: { totalPages } }` |
| Rate limit | 10 req/s por IP — mantemos 150 ms entre páginas |
| Acesso | o IP da máquina precisa estar liberado no JACAD |

Duas armadilhas que custam tempo se descobertas na marra: o header de
autorização **não** usa `Bearer`, e turmas exigem `turmaStatus` (a API não
aceita "todos", daí as quatro varreduras por período).

### Endpoints utilizados

| Recurso | Endpoint | Parâmetros |
|---|---|---|
| Organizações | `/api/v1/basicos/organizacoes` | `pageSize` |
| Períodos letivos | `/api/v1/academico/periodos-letivos/` | `idOrg` |
| Cursos | `/api/v1/academico/cursos-base/` | — |
| Turmas | `/api/v1/academico/turmas` | `turmaIdPeriodoLetivo`, `turmaStatus` |
| Alunos / matrículas | `/api/v1/academico/matriculas` | `idPeriodoLetivo` |
| Disciplinas cursadas | `/api/v1/academico/matricula-disciplina` | `idMatricula` |

> O Hub usa o endpoint **v1** de matrículas de propósito: o v2 tem um bug de SQL
> no backend do JACAD para o usuário de integração (subquery de permissões de
> organização). Mantemos a mesma escolha.

## Arquitetura: dois passos

```
   JACAD API  ──►  jacad_*  (staging, payload cru em `raw`)  ──►  entidades do CPA
                   ingest.ts                                      promover.ts
```

Separados de propósito:

- reprocessar o mapeamento (corrigir um turno, mudar a regra de nome de turma)
  não deve exigir bater na API de novo — ela é lenta e tem rate limit;
- `raw` preserva campos que hoje não usamos e amanhã podem importar;
- se a promoção estiver errada, o staging continua sendo a prova do que a API
  realmente devolveu.

É o mesmo desenho do Hub (`matriculas`, `turmas`, `periodos_letivos` + `raw`).

## Uso

```bash
npm run jacad -- testar                          # valida a autenticação
npm run jacad -- sync periodos                   # 1. pré-requisito
npm run jacad -- sync cursos                     # 2.
npm run jacad -- sync turmas --ano=2026          # 3. depende de periodos
npm run jacad -- periodos                        # descubra o id do período
npm run jacad -- sync matriculas --periodo=38    # 4. os alunos
npm run jacad -- sync disciplinas --periodo=38   # 5. lento — ver abaixo
npm run jacad -- conciliar-docentes --periodo=38  # 6. casa docentes com perfis
npm run jacad -- promover --periodo=38           # staging -> CPA
```

`sync tudo --periodo=38` encadeia os cinco primeiros na ordem correta.

Diagnósticos que **não gravam nada** e ajudam antes de rodar pra valer:

```bash
npm run jacad -- verificar                        # amostras de cada endpoint
npm run jacad -- sondar-docentes --periodo=42     # há id estável de docente?
npm run jacad -- sondar-perfis --nome="<nome>"    # filtros de /basicos/perfis
npm run jacad -- simular-conciliacao --periodo=42 # taxa de casamento de docentes
```

O passo **disciplinas** faz uma chamada por matrícula. Com 2.000 alunos e 150 ms
de pausa, conte cerca de 5 minutos por período — e rode da máquina com IP
liberado. O Hub tem a mesma característica e o mesmo aviso.

Acompanhe o estado pelo painel, em **Integrações → Importar do JACAD**.

## Mapeamento para o CPA

| JACAD | CPA | Observação |
|---|---|---|
| `periodos-letivos` | `AcademicTerm` | código `2026.1` a partir de `ano`/`semestre` |
| `cursos-base` | `Course` | código = `codigoCurso`, ou `JACAD-<id>` |
| `turmas` (ATIVA, AGUARDANDO) | `SchoolClass` | turno normalizado; `periodoItem` → número |
| `matriculas` | `User(ALUNO)` + `Enrollment` | chave = RA |
| `matricula-disciplina` | `Subject` + `TeachingAssignment` + `StudentSubject` | ver abaixo |

`TeachingAssignment` é o registro mais importante da integração: **é ele que
decide quem cada aluno vai avaliar**. Se a alocação estiver errada, o aluno
avalia o professor errado — e a confiança no instrumento se perde no primeiro
dia. Confira uma turma manualmente antes de abrir qualquer ciclo.

## Os professores

O JACAD **não expõe um cadastro de docentes** nos endpoints acadêmicos. O
professor aparece uma única vez, como campo `professor` dentro de
`matricula-disciplina`, e vem como **nome em texto livre**.

Sem e-mail, o docente não entra no sistema: não vê o próprio relatório nem
responde à autoavaliação. A saída é `/api/v1/basicos/perfis`, o cadastro de
pessoas do JACAD (18.807 registros), que aceita o filtro **`search`** e devolve
`idPerfil`, `nome`, `email`, `cpf`, `cargo` e `status`.

> `cargo` está vazio na esmagadora maioria dos perfis — não serve para isolar
> docentes. Por isso partimos dos nomes que aparecem em `matricula-disciplina`,
> e não de uma varredura de perfis.

O comando `conciliar-docentes` faz esse casamento e grava o resultado em
`jacad_docente_conciliacoes`, com status por nome. O promotor consome essa
tabela: docente conciliado entra **ATIVO com e-mail real**; o resto entra
**INATIVO** com e-mail provisório e é reportado como pendência.

### Execução real — período 42 (2026.2)

A importação completa rodou contra a base de produção:

| | |
|---|---|
| Períodos letivos | 40 |
| Cursos | 210 |
| Turmas 2026 | 244 (119 ativas no período) |
| Alunos | **1.814** em 1.864 matrículas (50 cursam dois cursos) |
| Linhas disciplina-aluno | 10.570 |
| Disciplinas distintas | 253 |
| Docentes | 88 — **64 ativos com e-mail**, 24 ambíguos |
| Alocações docentes | 797 |
| Média de professores por aluno | **4,8** |

O passo  levou cerca de 12 minutos para as 1.864 matrículas.

### O que a medição real mostrou

Amostra de 32 docentes do período 42 (2026.2), via `simular-conciliacao`:

| Resultado | Docentes | |
|---|---|---|
| **Conciliados** (1 perfil exato) | 23 | **72%** — todos com e-mail |
| **Ambíguos** (2–3 perfis com o mesmo nome) | 9 | 28% |
| **Não encontrados** | 0 | 0% |

Duas leituras importantes:

- **Zero não encontrados.** A fonte está completa: todo professor que dá aula
  tem cadastro em `perfis`. O problema é de desambiguação, não de cobertura.
- **Os ambíguos não são duplicatas triviais.** Investigando os 8 primeiros:
  todos os candidatos têm **CPFs diferentes** e todos estão **ATIVOS**. São
  homônimos reais, ou o mesmo docente cadastrado duas vezes com CPF divergente
  — e a API não permite distinguir os dois casos.

Por isso a conciliação **não escolhe sozinha** nesses casos. Escolher errado
mandaria as avaliações de um professor para outra pessoa, que é o pior defeito
possível num instrumento de avaliação docente. Os candidatos ficam registrados
em `candidatos` (com `temEmail`, que costuma apontar o cadastro principal) para
decisão no painel; uma vez resolvido à mão, o status vira `MANUAL` e nenhuma
re-execução o sobrescreve.

### `idDisciplinaProfessor` não resolve

`matricula-disciplina` traz também `idDisciplinaProfessor`, que parece um id de
docente mas não é: identifica o **vínculo** disciplina × professor × turma. Na
amostra, 15 dos 27 professores tinham mais de um id — um por disciplina. Nenhum
id apontou para nomes diferentes, então ele é confiável *dentro* de uma
disciplina, mas não agrupa a pessoa.

### O caminho definitivo

Pedir à secretaria uma planilha com **nome, CPF e e-mail institucional** dos
docentes ativos e conciliar por CPF. Isso zera a ambiguidade e vira o importador
CSV da Fase 1. Enquanto isso, 72% dos docentes já entram funcionando, e os 28%
restantes são uma fila de decisão curta — não um bloqueio do ciclo.



## Configuração

```bash
JACAD_BASE_URL=https://insted-developer.jacad.com.br
JACAD_TOKEN=          # chave de API — nunca commitada
JACAD_PAGE_SIZE=200
JACAD_SLEEP_MS=150    # rate limit: 10 req/s por IP
JACAD_TIMEOUT=60
```

O token vive **apenas no ambiente**, nunca na tabela `integration_settings` —
diferente do Hub, que o guarda em `api_parametros`. A tabela existe para
`base_url`, `pageSize` e afins, editáveis sem deploy; a credencial fica fora do
banco para não circular em dump nem em backup.

## Onde fica o código

```
packages/jacad/src/
├── client.ts     cliente HTTP: auth, cache de token, retry 401, paginação
├── ingest.ts     API -> staging jacad_*
├── conciliar-docentes.ts  nome do professor -> cadastro real (perfis)
├── promover.ts   staging -> entidades do CPA
├── verificar.ts / sondar-*.ts / simular-conciliacao.ts   diagnósticos
├── tipos.ts      formato dos elementos da API
└── cli.ts        comandos
```

A tela em `apps/admin/src/app/integracoes/jacad/` é somente leitura hoje: mostra
o estado e os comandos. Quando a API NestJS entrar na Fase 1, ela ganha os
botões e dispara os jobs via BullMQ, com o CLI continuando a existir para
execução manual e recuperação.
