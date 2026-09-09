# Modalidade e abrangência do ciclo

Como o sistema decide **quais perguntas cada aluno recebe** quando o mesmo
semestre tem disciplinas EAD e presenciais, e quando o ciclo cobre mais de um
semestre.

## O problema

Em 2025 a CPA resolvia isso com **formulários separados** no Drive
("…- EAD" e "…- Presencial"), aplicados a turmas diferentes. Isso não escala:
um aluno de curso presencial que cursa uma disciplina EAD precisaria responder
aos dois formulários, e ninguém consolidaria os dois num relatório só.

Além disso, o ciclo avalia o **ano**, não o semestre: em 2026.2 o aluno responde
sobre o que cursa agora e sobre o que cursou em 2026.1.

## A solução

### Modalidade vive na oferta, não na disciplina

`TeachingAssignment.modalidade` (`PRESENCIAL` · `EAD` · `SEMIPRESENCIAL` ·
`NAO_INFORMADA`). A mesma disciplina pode ser presencial num semestre e EAD no
outro — quem carrega a modalidade é a oferta daquele semestre.

**O JACAD não tem um campo de modalidade da disciplina.** A promoção deriva de
duas fontes, nesta ordem:

1. **A turma que oferta** (`idTurmaDisciplina` → `turno = EAD`). É o sinal que
   captura a disciplina EAD dentro de um curso presencial.
2. **A modalidade do curso** (`PRESENCIAL` / `EAD` / `SEMIPRESENCIAL`).

Sem nenhuma das duas, fica **`NAO_INFORMADA`** — de propósito. Assumir
"presencial" por omissão faria uma parte grande dos alunos receber o
questionário errado sem que ninguém percebesse.

### Blocos filtrados por modalidade

`QuestionBlock.targetFiltro` aceita:

```jsonc
{ "modalidades": ["EAD"] }         // só ofertas EAD
{ "departmentIds": ["..."] }       // só estes setores
{ "semestres": ["2026.1"] }        // só disciplinas deste semestre
```

Um bloco com filtro de modalidade só gera cards das ofertas daquela modalidade.
Ofertas `NAO_INFORMADA` **nunca casam com um filtro** — entram apenas em blocos
sem filtro.

Configuração equivalente ao que o Drive fazia com dois formulários:

| Bloco | Alvo | Filtro |
|---|---|---|
| Infraestrutura | — | — |
| Avaliação docente — presencial | um card por professor | `PRESENCIAL` |
| Avaliação docente — EAD | um card por professor | `EAD` |
| Comentários | — | — |

Um formulário só. Cada aluno recebe os cards da modalidade que cursa.

### Ciclo que cobre vários semestres

`EvaluationPeriodTerm` liga um período de avaliação a **N semestres letivos**.
O gerador de alvos monta os cards a partir das ofertas de todos eles, e quando
há mais de um semestre o card ganha o sufixo (`Prof. Ana — Banco de Dados · 2026.1`),
para o aluno saber do que está falando.

Sem nenhum `EvaluationPeriodTerm` vinculado, o ciclo usa o `termId` principal.

## Uso

```bash
npm run alvos -- periodos                  # ciclos cadastrados
npm run alvos -- gerar --periodo=<id>      # gera tarefas e alvos
npm run alvos -- previa --ra=<matrícula>   # o que ESTE aluno vai ver
```

`previa` é a ferramenta de conferência antes de abrir um ciclo: mostra as
disciplinas do aluno com semestre e modalidade, e a lista exata de cards do
wizard. Confira alguns alunos de cada modalidade antes de liberar.

`gerar` é idempotente: reexecutar após uma nova importação recalcula os alvos,
e **não mexe em tarefas já concluídas** — as respostas dessas já existem.

## O que a execução real mostrou (2026.2)

Ofertas por modalidade, depois da limpeza de placeholders:

| Modalidade | Ofertas | Professores |
|---|---|---|
| PRESENCIAL | 251 | 54 |
| NÃO INFORMADA | 203 | 41 |
| EAD | 115 | 10 |

O filtro funciona: alunos de cursos EAD recebem o bloco EAD, alunos presenciais
recebem o presencial, e cada um vê só os seus professores.

### Duas armadilhas encontradas nos dados

**1. "A Confirmar" é um professor no JACAD.** Aparecia em 56 ofertas EAD e, sem
tratamento, virava um usuário `PROFESSOR` com **792 inscrições de alunos** — ou
seja, 792 cards pedindo que o aluno avaliasse um placeholder, cuja nota depois
entraria na média como se fosse gente. A promoção agora descarta a oferta
inteira quando o nome do docente está na lista de marcadores
(`A Confirmar`, `A Definir`, `A Designar`…). Sem professor definido não há o que
avaliar.

**2. Modalidade em branco deixa o aluno sem card de docente.** Com os blocos
docentes filtrados por modalidade, os alunos cujas ofertas são `NAO_INFORMADA`
não recebem nenhum card de professor. Isso é o comportamento correto — melhor
não perguntar do que perguntar errado —, mas é **uma pendência de cadastro, não
um recurso**: a modalidade precisa ser preenchida nos cursos do JACAD antes de
abrir o ciclo. O comando `gerar` conta e reporta essas ofertas ao final.

### Um padrão que vale a CPA olhar

No EAD, poucos docentes cobrem muitas disciplinas — uma única professora
respondia por 85 ofertas. Na prática, o aluno EAD recebe vários cards para
avaliar **a mesma pessoa**, um por disciplina. Se a intenção é avaliar o
desempenho da pessoa (e não da disciplina), vale agrupar; se é avaliar a
condução de cada disciplina, o formato atual está certo. É decisão do
instrumento, não do sistema.
