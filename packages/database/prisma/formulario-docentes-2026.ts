/**
 * Autoavaliação do Docente e Avaliação Institucional — 2026.
 *
 *   npm run db:formulario-docentes
 *   npm run db:formulario-docentes -- --simplificado
 *   npm run homolog -- formulario-docentes --simplificado
 *
 * Transcrito do PDF da CPA (Questionario_Docente_INSTED_CPA). SUBSTITUI o
 * conteúdo do formulário docente que já existe — aquele veio da extração
 * automática do Drive, com 96 perguntas numa escala diferente, e nunca foi
 * usado em ciclo nenhum. Substituir só acontece enquanto isso for verdade: com
 * ciclo vinculado ou resposta enviada, o script recusa e manda duplicar.
 *
 * DOIS MODOS, e a diferença não é estética:
 *
 * - COMPLETO (padrão): coordenação/NDE se repete por curso em que o docente
 *   atua, e a percepção sobre turmas se repete por turma dele. Exige o tipo de
 *   alvo TURMA no banco e o gerador que sabe montar esses cards.
 * - SIMPLIFICADO (`--simplificado`): os mesmos itens em card único, com a
 *   redação ajustada para o plural — "deste curso" não quer dizer nada quando
 *   o card é um só. Existe para soltar a pesquisa em um ambiente que ainda não
 *   recebeu a migração e o código do modo completo. O resultado não separa por
 *   curso nem por turma: a CPA saberá a média da coordenação, não de qual.
 *
 * Dois blocos se repetem, e é isso que o torna diferente de tudo que havia:
 *
 * - SEÇÃO 3B, um card por CURSO em que o docente atua. Coordenação e NDE são
 *   de um curso; quem leciona em três avaliaria "a coordenação" uma vez só,
 *   sem dizer qual, e a nota não serviria para nenhuma das três.
 * - SEÇÃO 5, um card por TURMA dele. A turma é a unidade que o professor
 *   reconhece ao opinar: mesmo dando duas disciplinas para a mesma turma, a
 *   percepção é uma só.
 *
 * Três coisas que o PDF traz e que estão registradas aqui como vieram, para a
 * CPA decidir — nenhuma foi "consertada" por conta própria:
 *
 * 1. A numeração do Bloco 0 pula o item 3 (vai de 2 para 4). Ou a pergunta foi
 *    removida na revisão, ou ficou de fora por engano.
 * 2. A seção 3 diz "os 11 itens abaixo foram mantidos exatamente como no
 *    formulário original" e lista 6. Com os 3 do bloco 3B dá 9, não 11.
 * 3. O PDF manda "Não sei avaliar / Não se aplica" ser categoria separada nas
 *    AFIRMAÇÕES INSTITUCIONAIS. Aplicado nas seções 2, 3, 3B e 4; fora da
 *    autoavaliação (ninguém deixa de saber avaliar a si mesmo) e da avaliação
 *    das turmas (são as turmas dele).
 *
 * Entra como RASCUNHO. Ninguém responde nada até a CPA publicar pelo painel.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

const ACORDO = {
  min: 1,
  max: 4,
  labels: {
    1: 'Discordo totalmente',
    2: 'Discordo',
    3: 'Concordo',
    4: 'Concordo totalmente',
  },
};

/** Texto do PDF para a categoria fora da escala. */
const NAO_SEI = 'Não sei avaliar / Não se aplica';

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
  repetivel?: boolean;
  obrigatorio?: boolean;
  questoes: Q[];
};

/** Afirmação na escala de concordância, sem categoria fora da escala. */
const acordo = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...ACORDO },
});

/** Afirmação institucional: aceita "não sei avaliar", que não pontua. */
const institucional = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...ACORDO, permiteNaoSeAplica: true, rotuloNaoSeAplica: NAO_SEI },
});

const aberta = (enunciado: string, ajuda?: string, maxLength = 500): Q => ({
  enunciado,
  ajuda,
  tipo: 'TEXTO_LIVRE',
  config: { maxLength },
  obrigatoria: false,
  peso: 0,
});

const blocos = (simplificado: boolean): Bloco[] => [
  // ────────────────────────────────────────────── Bloco 0 — Identificação
  {
    titulo: 'Identificação',
    descricao:
      'Caracterização do docente. Não entra em nenhuma média — serve para cruzar os resultados por curso e por tempo de casa.',
    targetType: 'AUTOAVALIACAO',
    questoes: [
      {
        enunciado: 'Em qual ou quais cursos você atua ou já atuou?',
        tipo: 'ESCOLHA_MULTIPLA',
        peso: 0,
        opcoes: [
          'Administração Presencial',
          'Ciências Contábeis',
          'Odontologia',
          'TADS',
          'Estética e Cosmética',
          'Pedagogia Presencial',
          'Direito',
          'Psicologia',
          'EAD Gestão Pública',
          'EAD Recursos Humanos',
          'EAD Comercial',
          'EAD Pedagogia',
          'EAD Administração',
          'Outro',
        ],
      },
      {
        enunciado: 'Quando foi contratado pelo Insted?',
        ajuda: 'No formato ano/semestre — por exemplo, 2021/2.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 20 },
        peso: 0,
      },
      aberta(
        'Gostaria de deixar um breve relato sobre sua visão da utilização das Metodologias Ativas em suas disciplinas?',
      ),
      {
        enunciado:
          'Em uma nota de 0 a 10, quanto você indicaria o Insted a um amigo ou familiar?',
        ajuda: '0 = não indicaria · 10 = indicaria certamente',
        tipo: 'NPS',
        config: { min: 0, max: 10 },
        obrigatoria: false,
      },
    ],
  },

  // ─────────────────────────────── Seção 1 — Autoavaliação docente
  {
    titulo: 'Autoavaliação — eficácia docente e condução das disciplinas',
    descricao: 'Sobre a sua própria atuação neste semestre.',
    targetType: 'AUTOAVALIACAO',
    questoes: [
      acordo(
        'Apresentei, cumpri e avaliei adequadamente o Plano de Ensino e Aprendizagem (PEA) ao longo do semestre.',
      ),
      acordo('Conduzi minhas aulas de forma clara, segura e bem planejada.'),
      acordo('Desenvolvi avaliações coerentes com o processo de ensino-aprendizagem.'),
      acordo('Utilizei metodologias ativas de forma eficaz e diversificada.'),
      acordo('Cumpri os prazos solicitados pela Coordenação de Curso.'),
      acordo(
        'A relação docente-discente favoreceu o aprendizado e o debate de ideias em sala de aula.',
      ),
      acordo(
        'Discuti os erros e acertos dos discentes de forma construtiva e respondi eficazmente aos seus questionamentos.',
      ),
      acordo(
        'Incentivei a aprendizagem ativa, a contextualização dos conteúdos e a busca de capacitação pelos discentes fora de sala de aula.',
      ),
      acordo(
        'Mantive postura profissional adequada: pontualidade, comprometimento com o desenvolvimento dos discentes e conduta apropriada frente a comportamentos inadequados.',
      ),
      {
        enunciado:
          'Em relação às Metodologias Ativas, qual situação melhor descreve sua atuação atual?',
        tipo: 'ESCOLHA_UNICA',
        peso: 0,
        opcoes: [
          'Não recebi capacitação e não me sinto preparado(a)',
          'Recebi apenas orientação informal e tenho dificuldade em aplicar',
          'Já participei de capacitação formal, mas ainda mesclo com o ensino tradicional',
          'Estudo por conta própria e utilizo com segurança',
          'Já participei de capacitação formal e utilizo com segurança',
        ],
      },
      aberta(
        'Deseja fazer algum comentário sobre sua autoavaliação?',
        'Aqui pode descrever alguma opinião sobre pontos não abordados, ou justificar alguma resposta.',
      ),
    ],
  },

  // ───────────────── Seção 2 — Conhecimento institucional e responsabilidade
  {
    titulo: 'Conhecimento institucional e responsabilidade social',
    targetType: 'INSTITUICAO',
    questoes: [
      institucional('Conheço o PDI (Plano de Desenvolvimento Institucional) do Insted.'),
      institucional('Conheço os Projetos Pedagógicos dos cursos em que atuo.'),
      institucional(
        'A prática de gestão compartilhada na tomada de decisões pela minha Coordenação de Curso é eficaz.',
      ),
      institucional(
        'A sistemática de atividades acadêmicas do Insted é comunicada ao docente com clareza.',
      ),
      institucional('Conheço o Plano de Carreira Docente do Insted.'),
      institucional('O Insted oferece um ambiente propício para o meu desenvolvimento profissional.'),
      institucional(
        'A instituição promove ações eficazes de responsabilidade social, inclusão e promoção da cidadania.',
      ),
    ],
  },

  // ────────────────────────────────── Seção 3 — Equipes e setores
  {
    titulo: 'Atuação das equipes e setores',
    descricao:
      'Itens mantidos na redação do formulário original, a pedido da CPA. O PDF anuncia 11 itens e lista 6 — confirmar se algum ficou de fora.',
    targetType: 'DEPARTAMENTO',
    questoes: [
      institucional('Como você avalia a atuação da Reitoria e das Pró-Reitorias do Insted?'),
      institucional('Como você avalia a atuação da equipe de TI?'),
      institucional('Como você avalia a atuação da equipe da Biblioteca?'),
      institucional(
        'Como você avalia a atuação da equipe de apoio de serviços gerais (limpeza/organização)?',
      ),
      institucional(
        'Como você avalia a atuação da Secretaria Acadêmica no atendimento aos professores?',
      ),
      institucional('Como você avalia a atuação dos setores Administrativo, Financeiro e RH?'),
    ],
  },

  // ──────────────────── Seção 3B — Coordenação e NDE, um card por curso
  simplificado
    ? {
        titulo: 'Coordenação e NDE',
        descricao:
          'Responda considerando o conjunto dos cursos em que você atua. Nesta versão o bloco não se repete por curso — o resultado não separa qual coordenação foi avaliada.',
        targetType: 'COORDENACAO',
        questoes: [
          institucional(
            'Como você avalia a atuação da Coordenação do(s) curso(s) em que você atua?',
          ),
          institucional(
            'Como você avalia a atuação do NDE (Núcleo Docente Estruturante) na melhoria do(s) curso(s) em que você atua?',
          ),
          institucional(
            'Como você avalia a atuação da Coordenação no desenvolvimento do PPC (Projeto Pedagógico do Curso)?',
          ),
        ],
      }
    : {
        titulo: 'Coordenação e NDE do curso',
        descricao:
          'Repetido uma vez por curso em que você atua. Responda pensando naquele curso.',
        targetType: 'CURSO',
        repetivel: true,
        questoes: [
          institucional('Como você avalia a atuação da Coordenação deste curso?'),
          institucional(
            'Como você avalia a atuação do NDE (Núcleo Docente Estruturante) deste curso na melhoria do curso?',
          ),
          institucional(
            'Como você avalia a atuação da Coordenação deste curso no desenvolvimento do PPC (Projeto Pedagógico do Curso)?',
          ),
        ],
      },

  // ─────────────────── Seção 4 — Infraestrutura e condições de trabalho
  {
    titulo: 'Infraestrutura física e condições de trabalho',
    descricao: 'Sobre o ambiente em que você trabalha.',
    targetType: 'INFRAESTRUTURA',
    questoes: [
      institucional(
        'Equipamentos tecnológicos disponíveis para o desenvolvimento das minhas funções.',
      ),
      institucional('Iluminação no meu local de trabalho.'),
      institucional('Sistema de refrigeração/ventilação no ambiente de trabalho.'),
      institucional('Mobiliário disponível para o desenvolvimento das minhas atividades.'),
      institucional(
        'Condições de acessibilidade para pessoas com deficiência, incluindo banheiros especiais.',
      ),
      institucional('Condições sanitárias e de limpeza dos banheiros.'),
      institucional(
        'Espaço físico e ambientação para o intervalo das aulas no ambiente dos docentes.',
      ),
    ],
  },

  // ───────────────────────── Seção 5 — Turmas, um card por turma
  simplificado
    ? {
        titulo: 'Percepção sobre as turmas',
        descricao:
          'Responda considerando o conjunto das suas turmas. Nesta versão o bloco não se repete por turma — o resultado não separa qual turma foi avaliada.',
        targetType: 'INSTITUICAO',
        questoes: [
          acordo(
            'De modo geral, minhas turmas possuem base de conhecimento e motivação adequadas para acompanhar o módulo.',
          ),
          acordo(
            'De modo geral, os discentes compreendem bem os conteúdos e aproveitam bem o tempo em sala de aula.',
          ),
          acordo(
            'De modo geral, os discentes dedicam tempo de estudo suficiente e demonstram competência na resolução de situações-problema nas avaliações.',
          ),
          acordo(
            'De modo geral, os discentes demonstram interesse pelo conteúdo e participação satisfatória nas atividades do módulo.',
          ),
          aberta('Deseja comentar sobre alguma das suas turmas?'),
        ],
      }
    : {
        titulo: 'Avaliação da turma',
        descricao:
          'Repetido uma vez por turma que você leciona. Responda pensando naquela turma.',
        targetType: 'TURMA',
        repetivel: true,
        questoes: [
          acordo(
            'A turma possui base de conhecimento e motivação adequadas para acompanhar o módulo.',
          ),
          acordo(
            'Os discentes compreendem bem os conteúdos e aproveitam bem o tempo em sala de aula.',
          ),
          acordo(
            'Os discentes dedicam tempo de estudo suficiente e demonstram competência na resolução de situações-problema nas avaliações.',
          ),
          acordo(
            'Os discentes demonstram interesse pelo conteúdo e participação satisfatória nas atividades do módulo.',
          ),
          aberta('Deseja comentar sobre esta turma?'),
        ],
      },

  // ─────────────────────────────────────────────────── Encerramento
  {
    titulo: 'Encerramento',
    targetType: 'INSTITUICAO',
    obrigatorio: false,
    questoes: [
      aberta(
        'Use este espaço para deixar alguma sugestão, consideração ou elogio.',
        'Não é necessário se identificar.',
      ),
    ],
  },
];

/** O formulário docente que já existe: este script reescreve o conteúdo dele. */
const NOME = '2026 Avaliação Institucional — Docentes';

const DESCRICAO_BASE =
  'Instrumento revisado da CPA para o corpo docente, transcrito do PDF de 2026: escala de concordância de quatro pontos, sem ponto médio, com "Não sei avaliar / Não se aplica" como categoria separada nas afirmações institucionais. Substitui a versão anterior de 96 perguntas, que veio da extração automática do Drive e nunca foi aplicada.';

const DESCRICAO_COMPLETO =
  ' Dois blocos se repetem: coordenação e NDE uma vez por curso em que o docente atua, e percepção sobre a turma uma vez por turma dele.';

const DESCRICAO_SIMPLIFICADO =
  ' ATENÇÃO: versão simplificada. No PDF, coordenação/NDE é respondido uma vez por curso e a percepção sobre turmas uma vez por turma; aqui os dois são card único, com a redação no plural. O resultado mostra a média da coordenação e das turmas em geral, sem separar qual. A versão que se repete depende de uma migração e de uma atualização do sistema.';

const ABERTURA =
  'Queridos(as) Professores(as) do Centro Universitário Insted, obrigado por participar da nossa Avaliação Institucional. Sua participação é muito importante para nós e sua opinião faz a diferença para o crescimento e a melhoria contínua do Insted. O questionário é anônimo e pode ser respondido em aproximadamente 10 minutos. Comissão Própria de Avaliação – CPA';

async function main(): Promise<void> {
  const simplificado = process.argv.includes('--simplificado');
  const BLOCOS = blocos(simplificado);

  log(`\n${NOME}${simplificado ? '  (versão simplificada)' : ''}\n`);

  const existente = await prisma.formTemplate.findFirst({
    where: { nome: NOME, versao: 1 },
    select: {
      id: true,
      status: true,
      _count: { select: { periodForms: true } },
    },
  });

  if (existente) {
    // Publicado é imutável — MENOS quando nunca saiu do lugar. Sem ciclo e sem
    // resposta, o "publicado" é só um botão apertado cedo demais: não há série
    // histórica para proteger, e reescrever é o que a CPA quer dizer com
    // "atualizar o que está lá". Com qualquer uso real, recusa.
    const respostas = await prisma.responseSet.count({
      where: { periodForm: { formId: existente.id } },
    });

    if (existente.status !== 'RASCUNHO' && (existente._count.periodForms > 0 || respostas > 0)) {
      log('⏭  Já foi usado em ciclo — não sobrescrevo instrumento em uso.');
      log(`    ${existente._count.periodForms} ciclo(s), ${respostas} resposta(s).`);
      log('    Para uma revisão, duplique pelo painel.\n');
      return;
    }

    if (existente.status !== 'RASCUNHO') {
      log('↻  O existente está publicado, mas sem ciclo e sem resposta: substituindo.');
    }

    await prisma.formTemplate.delete({ where: { id: existente.id } });
  }

  const form = await prisma.formTemplate.create({
    data: {
      nome: NOME,
      descricao: `${DESCRICAO_BASE}${
        simplificado ? DESCRICAO_SIMPLIFICADO : DESCRICAO_COMPLETO
      }\n\nTexto de abertura sugerido: ${ABERTURA}`,
      publico: 'PROFESSOR',
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
        repetivel: b.repetivel ?? false,
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
  log('    · A numeração do PDF pula o item 3 do Bloco 0 (vai de 2 para 4).');
  log('    · A seção 3 anuncia 11 itens e lista 6 — confirmar se faltou algum.');
  log('    · "Não sei avaliar / Não se aplica" foi aplicado nas seções 2, 3,');
  log('      3B e 4; fora da autoavaliação e da avaliação das turmas.');
  if (simplificado) {
    log('    · VERSÃO SIMPLIFICADA: coordenação/NDE e turmas em card único, com');
    log('      a redação no plural. O resultado não separa por curso nem por');
    log('      turma. Para a versão que se repete, é preciso a migração do');
    log('      alvo TURMA e a atualização do sistema.');
  } else {
    log('    · Coordenação/NDE repete por curso e a seção 5 por turma: o docente');
    log('      sem turma no semestre recebe o questionário sem esses blocos.');
  }
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
