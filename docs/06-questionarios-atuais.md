# Os questionários da CPA hoje (ciclo 2025)

Análise dos formulários e planilhas de resposta no Drive da CPA
(*Questionarios 2025-2*). Serve para dois fins: reproduzir fielmente o
instrumento no novo sistema e registrar o que **muda** na migração.

## Como funciona hoje

**Um Google Form por turma.** A pasta tem cerca de 30 planilhas com nomes como
*"Cópia de 2025 Avaliação Institucional – Faculdade Insted – Psicologia – turma
N5, N6"*, e há arquivos chamados *"Cópia de Cópia de 2025 DOCENTES"*. Cada
turma responde a um formulário duplicado, gera sua própria planilha, e a
consolidação (*DISCENTES GERAL*, *Odontologia-GERAL*) é feita à mão.

É esse trabalho — duplicar formulário, coletar 30 planilhas, consolidar — que o
sistema elimina. Um único `FormTemplate` com blocos e alvos resolve o mesmo
instrumento sem cópias.

## Os três instrumentos

| Público | Perguntas | Escala |
|---|---|---|
| **Discentes** | 10 + 1 dissertativa | rótulos textuais + "Não se aplica" |
| **Docentes** | ~90 | numérica 1–5, legendas variadas |
| **Técnico-administrativo** | ~60 | numérica 1–5 (+ 0 = não se aplica) |

### Discentes — 11 itens

Identificação: apenas **curso** e **turma**. Sem nome, sem RA, sem e-mail — o
anonimato já é prática consolidada, e o campo dissertativo diz explicitamente
*"Por favor, não se identifique"*.

*Bloco infraestrutura (1–5):* salas de aula · biblioteca · laboratórios ·
espaços de convivência · ambiente geral (limpeza, sinalização, acessibilidade,
segurança).

*Bloco docentes (6–10):* domínio do conteúdo · didática · articulação com o AVA ·
comprometimento · qualificação e diversidade do corpo docente.

*Campo dissertativo:* até 500 caracteres, opcional.

**Escala:** `Excelente · Muito bom · Bom · Regular · Ruim` + `Não se aplica`.

### Docentes — ~90 itens

Perfil (cursos, ano de contratação, ano de nascimento), metodologias ativas,
**NPS 0–10**, autoavaliação (7.1–7.11), relação com discentes (8.x), práticas de
ensino (9.x), postura (10.x), conhecimento institucional — PDI, PPC, plano de
carreira (12.x), **avaliação de 11 setores** (13.x), espaço físico (14.x),
afirmações de concordância (15.1–15.22), infraestrutura (16.x), **avaliação dos
discentes pelo professor** (18.x), e quatro campos dissertativos.

### Técnico-administrativo — ~60 itens

Perfil sociodemográfico (gênero, ano de nascimento, estado civil, cor/raça,
escolaridade), frequência de atendimento por público, autoavaliação (8.x),
**NPS 0–10**, percepção institucional (12.x), clareza e apoio da gestão
(14.1–14.13), satisfação geral, **avaliação de 13 setores** (17.x) e comentários.

## O que isso confirma no desenho do sistema

| Achado | Onde já está previsto |
|---|---|
| Escala de 5 níveis com "não se aplica" | `QuestionType.LIKERT` + `config.permiteNaoSeAplica` |
| NPS 0–10 nos dois formulários de colaboradores | `QuestionType.NPS` |
| Avaliação de setores nomeados | `TargetType.DEPARTAMENTO` (repetível) |
| Autoavaliação docente | `TargetType.AUTOAVALIACAO` |
| Recorte por curso e turma, sem identificar | `respondentCourseId` / `respondentClassId` |
| Campos dissertativos opcionais | `TEXTO_LIVRE` com `peso = 0` |
| Três públicos distintos | `FormAudience` |

Nada no instrumento atual exige um tipo de questão que o motor não tenha.

## O que muda — e precisa de decisão da CPA

### 1. O aluno não avalia professor individualmente hoje

Este é o ponto mais importante. As perguntas 6 a 10 do formulário discente
falam de **"os professores"** no plural, em bloco:

> *6- Como você avalia o domínio do conteúdo demonstrado pelos professores nas disciplinas?*

Não existe hoje uma nota por docente. O sistema que estamos construindo prevê
um bloco `PROFESSOR_DISCIPLINA` repetível — um card por professor alocado, com
média individual por docente.

Isso é **mudança de política de avaliação, não de ferramenta**. Tem implicações
reais: relação com o corpo docente, uso em avaliação de desempenho, e a
necessidade do k-anonimato que já está no schema (uma turma de 8 alunos com 3
respondentes torna a nota individual do professor quase rastreável).

Também explica por que o JACAD nunca precisou expor um cadastro de docentes
consistente: até hoje ninguém avaliou professor por nome.

**Decisão necessária:** manter o bloco genérico, adotar avaliação individual, ou
rodar os dois em paralelo no primeiro ciclo.

### 2. Três escalas diferentes, não comparáveis

| Público | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Discentes | Ruim | Regular | Bom | Muito bom | Excelente |
| Docentes (14.x) | Muito insatisfatório | Insatisfatório | Adequado | Satisfatório | Muito satisfatório |
| Técnico-adm. | Muito insuficiente | Insuficiente | Adequado | Bom | Excelente |

O ponto médio do discente é "Bom"; o dos colaboradores é "Adequado". "Bom" vale
3 numa escala e 4 na outra. Qualquer comparação entre públicos hoje é inválida,
e um relatório consolidado que some essas notas está errado.

O motor suporta escalas distintas por bloco (`Question.config.labels`), então dá
para reproduzir exatamente o que existe. Mas **uniformizar é a oportunidade
óbvia** deste redesenho — e só a CPA pode decidir, porque quebra a série
histórica.

### 3. Desproporção entre instrumentos

11 perguntas para o aluno contra ~90 para o docente. O formulário docente leva
20–30 minutos; é provável que boa parte da baixa adesão docente venha daí. Vale
revisar antes de migrar — o sistema herda o tamanho que a CPA definir.

### 4. Defeitos a corrigir na migração

- **Perguntas duplicadas no formulário docente:** os itens 14.1–14.7
  (equipamentos, iluminação, refrigeração, mobiliário, acessibilidade,
  banheiros, espaço de intervalo) reaparecem quase idênticos em 16.1–16.7. São
  sete perguntas respondidas duas vezes.
- **Numeração inconsistente:** há dois itens "3." no formulário docente ("Em que
  ano você nasceu?" e "Desde que foi contratado, teve algum treinamento…").
- **Resquício de grade:** o cabeçalho do item 14 carrega o texto da legenda e um
  sufixo `[14.7 …]`, herança da questão em matriz do Google Forms.

### 5. Risco de reidentificação nos formulários de colaboradores

O formulário docente coleta **ano de contratação + ano de nascimento + cursos em
que atua**. Com 88 docentes, essa combinação identifica boa parte das pessoas.
O técnico-administrativo coleta **gênero, ano de nascimento, estado civil,
cor/raça e escolaridade** — num quadro pequeno, identifica praticamente
qualquer respondente. E logo depois pede para avaliar **diretores citados
nominalmente**.

Um colaborador que perceba isso não responde com sinceridade, ou não responde.
No novo sistema, o `minimoRespostasExibicao` protege a exibição, mas não adianta
proteger a saída se a entrada coleta identificadores. **Recomendo remover
cor/raça, estado civil e ano de nascimento** do instrumento de colaboradores, ou
convertê-los em faixas amplas — o formulário discente, que não pergunta nada
disso, é o modelo certo.

## Próximo passo técnico

Traduzir os três instrumentos em `FormTemplate` no seed, com as escalas reais
de cada público. Assim a CPA valida o conteúdo na interface antes de qualquer
decisão sobre mudanças — comparando lado a lado com o que responderam em 2025.
