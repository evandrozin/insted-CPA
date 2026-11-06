/**
 * Programa de Acompanhamento de Egressos (PAE) — Graduação.
 *
 *   npm run db:formulario-egressos
 *   npm run homolog -- formulario-egressos
 *
 * Transcrito do questionário da CPA (questionario_egressos.pdf, exportado do
 * Google Forms). Ao contrário dos demais instrumentos, este NÃO chega ao respondente
 * por tarefa: egresso não tem matrícula ativa nem conta. A comissão decidiu que
 * ele é respondido por uma página pública do Insted, sem validação nenhuma
 * (`/egressos`), e que o egresso informa o curso de origem.
 *
 * Por isso o público do formulário é EGRESSO — o gerador de tarefas o ignora — e
 * o ciclo é criado em Ciclos → Público: Egressos.
 *
 * O que mudou em relação ao PDF, para a CPA conferir:
 *
 * 1. "Nome completo" saiu. O próprio texto de abertura promete sigilo do nome, e
 *    a página é aberta a qualquer pessoa: um nome digitado não identifica
 *    ninguém de forma confiável e só tornaria a resposta rastreável.
 * 2. "Idade" virou faixa etária (resposta de número livre num grupo pequeno
 *    ajuda a reconhecer a pessoa).
 * 3. "Curso concluído" não está aqui como pergunta: a página oferece a lista de
 *    cursos e grava a escolha como recorte da resposta (é o que permite separar
 *    o resultado por curso). Fica a pergunta aberta "Outro curso", para quem
 *    não achar o seu na lista (curso extinto, por exemplo).
 * 4. As perguntas sobre o trabalho atual (função, relação com a formação, renda,
 *    permanência, formação continuada) ficaram OPCIONAIS: no PDF eram
 *    obrigatórias, mas quem não trabalha não tem o que responder.
 * 5. As escalas são as do PDF — três pontos, sem ponto médio —, inclusive a
 *    inversão entre "Pouco satisfatório" e "Regular", que são os níveis mais baixos.
 *
 * Entra como RASCUNHO. Ninguém responde nada até a CPA publicar pelo painel.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

const SATISFACAO3 = {
  min: 1,
  max: 3,
  labels: { 1: 'Pouco satisfatório', 2: 'Satisfatória', 3: 'Plenamente satisfatória' },
};

const QUALIDADE3 = {
  min: 1,
  max: 3,
  labels: { 1: 'Regular', 2: 'Bom', 3: 'Excelente' },
};

type Q = {
  enunciado: string;
  ajuda?: string;
  tipo?: QuestionType;
  config?: Record<string, unknown> | null;
  obrigatoria?: boolean;
  peso?: number;
  opcoes?: string[];
};

type Bloco = {
  titulo: string;
  descricao?: string;
  targetType: TargetType;
  questoes: Q[];
};

const satisfacao = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...SATISFACAO3 },
});

const qualidade = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...QUALIDADE3 },
});

/** Pergunta de perfil ou de situação: não entra em nenhuma média. */
const escolha = (enunciado: string, opcoes: string[], obrigatoria = true): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  opcoes,
  obrigatoria,
  peso: 0,
});

const BLOCOS: Bloco[] = [
  {
    titulo: 'Perfil',
    descricao:
      'Quem responde. As respostas são anônimas e servem para conhecer o perfil do egresso.',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Qual o seu gênero?', ['Masculino', 'Feminino', 'Prefiro não informar', 'Outro']),
      escolha('Qual a sua idade?', [
        'Até 24 anos',
        'De 25 a 34 anos',
        'De 35 a 44 anos',
        'De 45 a 54 anos',
        '55 anos ou mais',
      ]),
    ],
  },
  {
    titulo: 'Curso concluído',
    descricao: 'Sobre o curso que você concluiu na Faculdade Insted.',
    targetType: 'INSTITUICAO',
    questoes: [
      {
        enunciado: 'Outro curso',
        ajuda:
          'Só se o seu curso não apareceu na lista acima (por exemplo, um curso que não existe mais). Escreva o nome.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 150 },
        obrigatoria: false,
        peso: 0,
      },
      {
        enunciado: 'Ano de conclusão',
        ajuda: 'Quatro dígitos, por exemplo 2024.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 4 },
        peso: 0,
      },
      { enunciado: 'Pretende cursar pós-graduação?', tipo: 'SIM_NAO', peso: 0 },
      {
        enunciado: 'Se você marcou sim, em qual área?',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 150 },
        obrigatoria: false,
        peso: 0,
      },
    ],
  },
  {
    titulo: 'A formação recebida',
    descricao: 'Como você avalia o curso que concluiu.',
    targetType: 'INSTITUICAO',
    questoes: [
      satisfacao('Distribuição das disciplinas ao longo dos termos cursados'),
      satisfacao('Carga horária das disciplinas'),
      satisfacao('Adequação dos conteúdos e programas para a formação profissional'),
      qualidade('Nível de conhecimento do corpo docente'),
      qualidade('Didática do corpo docente para desenvolver os conteúdos'),
      qualidade('Formação obtida para atividade profissional'),
      qualidade('Grau de satisfação com o curso concluído em relação à formação obtida'),
    ],
  },
  {
    titulo: 'Estrutura da Faculdade',
    descricao: 'A estrutura que você usou durante o curso.',
    targetType: 'INSTITUICAO',
    questoes: [
      qualidade('Espaço físico da Faculdade disponível para o desenvolvimento do curso'),
      qualidade('Recursos didático-pedagógicos para o desenvolvimento do curso'),
      qualidade('Ambiente da biblioteca para os estudos exigidos'),
      qualidade('Recursos de informática para apoiar as atividades dos estudantes'),
      qualidade('Espaços de convivência'),
      qualidade('Área de alimentação'),
    ],
  },
  {
    titulo: 'Trabalho e inserção profissional',
    descricao:
      'Quem não trabalha atualmente pode deixar em branco as perguntas sobre o trabalho atual.',
    targetType: 'INSTITUICAO',
    questoes: [
      {
        enunciado: 'Realizou estágio profissional (não curricular) durante a graduação?',
        tipo: 'SIM_NAO',
        peso: 0,
      },
      escolha('Atividade laboral durante a graduação', [
        'Não trabalhou',
        'Trabalhou durante todo o curso',
        'Trabalhou apenas durante uma parte do curso',
      ]),
      escolha('Exerceu seu trabalho', [
        'No setor público',
        'No setor privado',
        'Como autônomo',
        'Não trabalhei',
      ]),
      escolha('Exerce seu trabalho atual', [
        'Há menos de 01 ano',
        'Entre 01 e 03 anos',
        'Entre 03 e 05 anos',
        'Mais de 05 anos',
        'Não trabalho',
      ]),
      escolha('Ingressou em seu trabalho atual por meio de', [
        'Concurso Público',
        'Indicação',
        'Envio de currículo',
        'Iniciativa pessoal (trabalho autônomo)',
        'Não trabalho',
      ]),
      escolha('Seu vínculo de trabalho é', [
        'Estatutário',
        'Contratado temporariamente',
        'Contratado por tempo indeterminado, no regime CLT (Consolidação das Leis Trabalhistas)',
        'Contratado por tempo indeterminado',
        'Informal',
        'Empregador',
        'Não trabalho',
      ]),
      {
        enunciado: 'Qual é a sua função e ou cargo atual?',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 150 },
        obrigatoria: false,
        peso: 0,
      },
      escolha(
        'Relação de sua função e ou cargo com sua área de formação no curso de graduação',
        ['Grande', 'Média', 'Pequena', 'Nenhuma'],
        false,
      ),
      escolha(
        'A formação recebida na graduação, para o exercício de sua função e ou cargo atual',
        ['Foi necessária', 'Desnecessária'],
        false,
      ),
      escolha(
        'Se você está trabalhando atualmente, qual a sua renda ou seu salário mensal',
        [
          'Menor que 2 salários mínimos',
          'Entre 2 e 5 salários mínimos',
          'Entre 5 e 10 salários mínimos',
          'Entre 10 e 15 salários mínimos',
          'Acima de 15 salários mínimos',
        ],
        false,
      ),
      escolha(
        'Expectativa de permanecer no trabalho atual',
        ['Grande', 'Média', 'Pequena', 'Não pretendo permanecer'],
        false,
      ),
      escolha(
        'Atividades de formação continuada/treinamento',
        [
          'Não realizo',
          'Realizei apenas no início (das atuais atividades laborais) ou (do trabalho atual)',
          'Realizo frequentemente',
          'Pretendo realizar no futuro',
        ],
        false,
      ),
    ],
  },
  {
    titulo: 'Espaço livre',
    targetType: 'INSTITUICAO',
    questoes: [
      {
        enunciado: 'Espaço livre',
        ajuda: 'Comentários, sugestões ou o que você quiser dizer à Faculdade.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 1000 },
        obrigatoria: false,
        peso: 0,
      },
    ],
  },
];

const NOME = 'Programa de Acompanhamento de Egressos — Graduação';

const DESCRICAO =
  'Instrumento da CPA para quem concluiu a graduação: formação recebida, estrutura da Faculdade e inserção no mercado de trabalho. Respondido por página pública, sem login (/egressos); o egresso escolhe o curso de origem na própria página. Escalas de três pontos, como no instrumento original.';

const ABERTURA =
  'Você está sendo convidado(a) a responder a um questionário sobre sua formação e inserção no mercado de trabalho. Ele tem a finalidade de conhecer o perfil do egresso do curso de Graduação e de apoiar a revisão contínua dos processos de aprendizagem e formação, para a melhoria da qualidade dos serviços educacionais prestados. Garantimos o sigilo quanto ao seu nome ou qualquer informação que possa identificá-lo. Agradecemos antecipadamente a sua contribuição. — Comissão Própria de Avaliação (CPA)';

async function main(): Promise<void> {
  log(`\n${NOME}\n`);

  // O instrumento antigo (conversão automática do PDF, público ALUNO) fica onde
  // está: não é tocado.
  const existente = await prisma.formTemplate.findFirst({
    where: { nome: NOME, versao: 1 },
    select: { id: true, status: true },
  });

  if (existente && existente.status !== 'RASCUNHO') {
    log('⏭  Já publicado — não sobrescrevo instrumento em uso.');
    log('    Para uma revisão, duplique pelo painel.\n');
    return;
  }
  if (existente) await prisma.formTemplate.delete({ where: { id: existente.id } });

  const form = await prisma.formTemplate.create({
    data: {
      nome: NOME,
      descricao: `${DESCRICAO}\n\nTexto de abertura sugerido: ${ABERTURA}`,
      publico: 'EGRESSO',
      versao: 1,
      status: 'RASCUNHO',
    },
  });

  let ordemBloco = 0;
  let questoes = 0;
  let alternativas = 0;

  for (const b of BLOCOS) {
    const bloco = await prisma.questionBlock.create({
      data: {
        formId: form.id,
        titulo: b.titulo,
        descricao: b.descricao ?? null,
        ordem: ordemBloco++,
        targetType: b.targetType,
        repetivel: false,
        obrigatorio: true,
      },
    });

    let ordemQuestao = 0;
    for (const q of b.questoes) {
      const questao = await prisma.question.create({
        data: {
          blockId: bloco.id,
          enunciado: q.enunciado,
          ajuda: q.ajuda ?? null,
          tipo: q.tipo ?? 'LIKERT',
          ordem: ordemQuestao++,
          obrigatoria: q.obrigatoria ?? true,
          config: (q.config ?? undefined) as object | undefined,
          peso: q.peso ?? 1,
        },
      });

      if (q.opcoes?.length) {
        await prisma.questionOption.createMany({
          data: q.opcoes.map((rotulo, i) => ({
            questionId: questao.id,
            rotulo,
            valor: null,
            ordem: i,
          })),
        });
        alternativas += q.opcoes.length;
      }
      questoes++;
    }
  }

  log(`✅ ${BLOCOS.length} blocos · ${questoes} questões · ${alternativas} alternativas`);
  log('');
  log('   Entrou como RASCUNHO. Revise e publique pelo painel.');
  log('');
  log('   Para a CPA conferir antes de publicar:');
  log('    · Use em Ciclos → Público: Egressos. O ciclo não gera tarefas: o egresso');
  log('      responde em /egressos, que mostra o formulário enquanto o ciclo está aberto.');
  log('    · "Nome completo" saiu (o texto promete sigilo e a página é aberta).');
  log('    · "Idade" virou faixa etária.');
  log('    · O curso de origem é escolhido na página, de uma lista, e vale como recorte.');
  log('    · As perguntas sobre o trabalho atual ficaram opcionais (quem não trabalha).');
  log('    · O instrumento "2026 Programa de Acompanhamento de Egressos" (conversão');
  log('      automática do PDF, público Discentes) continua cadastrado e NÃO serve:');
  log('      pode ser arquivado.');
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
