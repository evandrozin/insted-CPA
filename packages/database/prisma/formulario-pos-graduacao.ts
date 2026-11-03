/**
 * Avaliação Institucional Discente — Pós-graduação.
 *
 *   npm run db:formulario-pos
 *   npm run homolog -- formulario-pos
 *
 * Transcrito do questionário da CPA (questionario_pos_graduacao.pdf, exportado
 * do Google Forms). É o instrumento do aluno de pós-graduação: perfil, curso,
 * infraestrutura, corpo docente, coordenação, satisfação, recomendação e um
 * campo aberto. Escala de CINCO pontos, com "Indiferente" — diferente da
 * graduação, que usa quatro sem ponto médio. Foi transcrita como veio.
 *
 * NÃO TOCA nos instrumentos da graduação: é um formulário próprio, com nome
 * próprio, e só chega a quem está em um CICLO DE PÓS. Quem separa os públicos
 * não é este formulário e sim o semestre letivo: o período "POS - 2026" do
 * JACAD vira um semestre à parte, o ciclo de pós cobre só ele, e o ciclo da
 * graduação nunca enxerga esses alunos. Ver `promover.ts` e `criarCiclo`.
 *
 * Duas coisas do documento ficaram registradas como vieram, para a CPA decidir:
 *
 * 1. O título do Google Forms ainda diz "INSTED 2024". O formulário aqui não
 *    carrega ano: o ano é do ciclo.
 * 2. A questão 3 oferece "Outro:" com campo para escrever. O modelo de questão
 *    não tem alternativa com texto — entra como a alternativa "Outra área".
 *
 * Entra como RASCUNHO. Ninguém responde nada até a CPA publicar pelo painel.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

const ACORDO = {
  min: 1,
  max: 5,
  labels: {
    1: 'Discordo totalmente',
    2: 'Discordo',
    3: 'Indiferente',
    4: 'Concordo',
    5: 'Concordo totalmente',
  },
};

const SATISFACAO = {
  min: 1,
  max: 5,
  labels: {
    1: 'Muito insatisfeito',
    2: 'Insatisfeito',
    3: 'Indiferente',
    4: 'Satisfeito',
    5: 'Muito satisfeito',
  },
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
  obrigatorio?: boolean;
  questoes: Q[];
};

const acordo = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...ACORDO },
});

/** Pergunta de perfil: não entra em nenhuma média. */
const escolha = (enunciado: string, opcoes: string[]): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  opcoes,
  peso: 0,
});

const BLOCOS: Bloco[] = [
  {
    titulo: 'Perfil',
    descricao:
      'Quem responde. As respostas são anônimas e servem para conhecer o perfil dos estudantes de pós-graduação.',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Qual o seu gênero?', ['Masculino', 'Feminino', 'Prefiro não informar', 'Outro']),
      escolha('Em que ano você nasceu?', [
        'Entre 1946 e 1964',
        'Entre 1965 e 1980',
        'Entre 1981 e 1996',
        'Entre 1997 e 2010',
        'A partir de 2010',
      ]),
      escolha('Área do seu curso de Pós-graduação na Faculdade INSTED:', [
        'Pós-graduação na área Jurídica',
        'Pós-graduação na área da Saúde',
        'Pós-graduação na área de Gestão e Negócios',
        'Pós-graduação na área da Educação',
        'Outra área',
      ]),
      {
        enunciado: 'Ano de início da pós-graduação:',
        ajuda: 'Quatro dígitos, por exemplo 2026.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 4 },
        peso: 0,
      },
    ],
  },

  {
    titulo: 'Sobre o curso',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo(
        'O conteúdo do curso está atualizado e alinhado às demandas do mercado e à área de conhecimento.',
      ),
      acordo(
        'O projeto pedagógico do curso (matriz curricular, objetivos, metodologias) é claro e bem divulgado.',
      ),
      acordo('Há integração entre teoria e prática nas disciplinas do curso.'),
    ],
  },

  {
    titulo: 'Sobre a infraestrutura',
    targetType: 'INFRAESTRUTURA',
    questoes: [
      {
        ...acordo(
          'As salas de aula e laboratórios utilizados para o curso são adequados às atividades propostas.',
        ),
        ajuda: 'Se a sua pós-graduação é a distância, avalie o ambiente virtual.',
      },
      acordo('A biblioteca física/virtual é suficiente em relação à quantidade e qualidade do acervo.'),
      acordo(
        'Os recursos tecnológicos (Ambiente Virtual de Aprendizagem, wi-fi, computadores etc.) são acessíveis e funcionam bem.',
      ),
    ],
  },

  {
    titulo: 'Sobre o corpo docente',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo('Os professores demonstram domínio dos conteúdos ministrados.'),
      acordo('Os professores são acessíveis para esclarecimento de dúvidas e orientações.'),
      acordo('Há incentivo à participação dos alunos em atividades de pesquisa, extensão ou inovação.'),
    ],
  },

  {
    titulo: 'Sobre a coordenação do curso',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo('A coordenação do curso é acessível e responde prontamente às demandas dos alunos.'),
      acordo('Os processos acadêmico-administrativos são claros e bem comunicados.'),
    ],
  },

  {
    titulo: 'Satisfação e recomendação',
    targetType: 'INSTITUICAO',
    questoes: [
      {
        enunciado: 'Qual o seu grau de satisfação geral com o curso?',
        tipo: 'LIKERT',
        config: { ...SATISFACAO },
      },
      {
        enunciado: 'Em uma nota de 0 a 10, quanto você indicaria a nossa faculdade a um amigo ou familiar?',
        ajuda: '0 = não indicaria · 10 = indicaria com certeza',
        tipo: 'NPS',
        config: { min: 0, max: 10 },
      },
    ],
  },

  {
    titulo: 'Sugestões e comentários',
    descricao:
      'Campo opcional. Favor não se identificar: o comentário passa pela moderação da CPA antes de chegar ao relatório.',
    targetType: 'INSTITUICAO',
    obrigatorio: false,
    questoes: [
      {
        enunciado:
          'Prezado(a) pós-graduando(a), estamos muito felizes que você chegou até aqui! Se quiser, deixe uma sugestão, consideração ou elogio.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 500 },
        obrigatoria: false,
        peso: 0,
      },
    ],
  },
];

const NOME = 'Avaliação Institucional Discente — Pós-graduação';

const DESCRICAO =
  'Instrumento da CPA para os estudantes de pós-graduação: perfil, curso, infraestrutura, corpo docente, coordenação, satisfação geral e indicação da instituição (0 a 10), mais um campo aberto opcional. Escala de concordância de cinco pontos, com "Indiferente". As perguntas sobre o corpo docente e a coordenação são do curso como um todo; não há avaliação individual de professor.';

const ABERTURA =
  'Querido estudante de pós-graduação, sua opinião importa. Este questionário é anônimo e tem a finalidade de conhecer o perfil dos estudantes dos cursos de pós-graduação e de apoiar a revisão contínua dos processos de aprendizagem e formação, para a melhoria da qualidade dos serviços educacionais prestados. Garantimos o sigilo do seu nome e de qualquer informação que possa identificá-lo. Obrigada por participar. — Comissão Própria de Avaliação (CPA)';

async function main(): Promise<void> {
  log(`\n${NOME}\n`);

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
      publico: 'ALUNO',
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
        obrigatorio: b.obrigatorio ?? true,
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
  log('    · Use este formulário só em um ciclo de PÓS (Ciclos → Público: Pós-graduação).');
  log('    · O título do Google Forms dizia "INSTED 2024"; aqui o ano é o do ciclo.');
  log('    · "Outro:" da questão 3 virou a alternativa "Outra área" (sem campo de texto).');
  log('    · Cada curso de pós costuma ter uma turma só: com o mínimo padrão de 5');
  log('      respostas por alvo, o resultado por curso pode não aparecer. Ajuste o');
  log('      k-anonimato do ciclo ao tamanho das turmas.');
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
