/**
 * Avaliação Institucional Discente — Graduação Presencial.
 *
 *   npm run db:formulario-presencial
 *   npm run homolog -- formulario-presencial
 *
 * Transcrito do PDF detalhado da CPA (Questionario_Graduacao_Presencial).
 * É um instrumento NOVO, não uma revisão do "2026 — Discentes": a régua mudou
 * de cinco pontos de qualidade para quatro de concordância, sem ponto médio,
 * para reduzir o viés de tendência central. Os dois convivem no banco; a CPA
 * decide qual publicar.
 *
 * Três pontos em que o sistema não entrega o que o PDF pede, e o que foi feito:
 *
 * 1. LÓGICA CONDICIONAL. O PDF abre a 3A só quando há crítica à infraestrutura,
 *    e a 21A só quando a permanência é 6 ou menos. O schema tem o campo
 *    `condicao`, mas nada no app o lê: a pergunta apareceria sempre, e marcar
 *    "obrigatória" prenderia o aluno numa pergunta que não era para ele. As
 *    duas entram OPCIONAIS, com a condição escrita no texto de apoio.
 *
 * 2. TURMA DINÂMICA. A pergunta 2 pede "carregar apenas as turmas válidas para
 *    o curso informado". Alternativa dinâmica não existe no modelo — as opções
 *    são fixas por questão. Entra como texto curto.
 *
 * 3. ESCALA DE FREQUÊNCIA NA GRADE. A grade 24.1–24.5 do PDF é uma matriz; aqui
 *    são cinco questões com a mesma régua (Nunca…Sempre). O resultado agregado
 *    é o mesmo, e cada item fica legível no celular.
 *
 * Curso e turma são perguntados por decisão da CPA, mesmo o sistema já sabendo
 * os dois pela matrícula. Ficam com peso 0 (fora das médias). Vale lembrar o
 * efeito: gravados junto com os comentários abertos, estreitam o cerco sobre
 * quem respondeu em turma pequena.
 *
 * Entra como RASCUNHO. Ninguém responde nada até a CPA publicar pelo painel.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

// ─────────────────────────────────────────────────────────────── escalas

/**
 * Quatro categorias nomeadas, sem ponto médio — o padrão deste instrumento.
 *
 * O PDF é explícito: "Não utilizei / não tive contato suficiente para avaliar"
 * é categoria separada e não recebe pontuação de 1 a 4. É o que
 * `permiteNaoSeAplica` faz: grava `naoSeAplica`, fora da média.
 */
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

/** A régua da grade de comportamentos do professor. */
const FREQUENCIA = {
  min: 1,
  max: 4,
  labels: { 1: 'Nunca', 2: 'Raramente', 3: 'Frequentemente', 4: 'Sempre' },
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
  repetivel?: boolean;
  targetFiltro?: Record<string, unknown>;
  obrigatorio?: boolean;
  questoes: Q[];
};

/**
 * Afirmação na escala de concordância.
 *
 * `naoSeAplica` recebe o texto exato do PDF para cada pergunta ("Não utilizei
 * laboratório neste semestre.") em vez de um "Não se aplica" genérico: é o que
 * diz ao aluno que deixar de usar o serviço é uma resposta válida, e não uma
 * nota baixa disfarçada.
 */
const acordo = (enunciado: string, naoSeAplica?: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: naoSeAplica
    ? { ...ACORDO, permiteNaoSeAplica: true, rotuloNaoSeAplica: naoSeAplica }
    : { ...ACORDO },
});

const frequencia = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...FREQUENCIA },
});

/**
 * A mesma afirmação, mas como lista de alternativas em vez de escala.
 *
 * DECISÃO DA CPA, tomada no editor e trazida para cá para não se perder na
 * próxima importação. Vale para os cinco primeiros itens — infraestrutura,
 * laboratórios, biblioteca, AVA e materiais EAD.
 *
 * O que muda, e não aparece na tela: alternativa não tem valor numérico.
 * "Concordo totalmente" como escala vale 4 e entra na média do bloco; como
 * alternativa é um rótulo que se conta. Estes cinco itens saem dos indicadores
 * e não se comparam com 2025 nem com os demais formulários de 2026 — por isso
 * peso 0, que é o que o sistema já usa para "está no formulário, fora da
 * média".
 *
 * O "não utilizei" entra como mais uma alternativa. Como escala ele era
 * categoria separada, fora da pontuação; aqui a distinção deixa de existir,
 * porque nenhuma das opções pontua.
 */
const acordoComoAlternativas = (enunciado: string, naoSeAplica?: string): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  peso: 0,
  opcoes: [
    'Discordo totalmente',
    'Discordo',
    'Concordo',
    'Concordo totalmente',
    ...(naoSeAplica ? [naoSeAplica] : []),
  ],
});

/** Escala 0–10. Peso 1: entra na média, é indicador de resultado. */
const linear = (enunciado: string, ajuda: string): Q => ({
  enunciado,
  ajuda,
  tipo: 'NPS',
  config: { min: 0, max: 10 },
});

/** Comentário aberto: opcional e com peso 0 — informativo, fora das médias. */
const aberta = (enunciado: string, maxLength = 500): Q => ({
  enunciado,
  tipo: 'TEXTO_LIVRE',
  config: { maxLength },
  obrigatoria: false,
  peso: 0,
});

/** Escolha de alternativa: caracterização, não avaliação. Fora das médias. */
const escolha = (
  enunciado: string,
  opcoes: string[],
  extra: Partial<Q> = {},
): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  opcoes,
  peso: 0,
  ...extra,
});

const PRESENCIAIS = ['PRESENCIAL', 'SEMIPRESENCIAL'];

// ──────────────────────────────────────────────────────────────── blocos

const BLOCOS: Bloco[] = [
  {
    titulo: 'Caracterização acadêmica',
    descricao:
      'Curso e turma. O sistema já conhece os dois pela matrícula; são perguntados por decisão da CPA e não entram em nenhuma média.',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Qual é o seu curso?', [
        'Administração',
        'Administração NEXT',
        'Análise e Desenvolvimento de Sistemas',
        'Ciências Contábeis',
        'Direito',
        'Estética e Cosmética',
        'Gestão Financeira',
        'Logística',
        'Odontologia',
        'Pedagogia',
        'Processos Gerenciais',
        'Psicologia',
        'Outro curso vigente',
      ]),
      {
        enunciado: 'Qual é a sua turma/semestre?',
        ajuda:
          'Escreva o semestre e o turno — por exemplo, "3º semestre noturno". A lista automática por curso ainda não existe no sistema.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 60 },
        peso: 0,
      },
    ],
  },
  {
    titulo: 'Infraestrutura',
    descricao: 'Instalações, laboratórios e biblioteca, na experiência deste semestre.',
    targetType: 'INFRAESTRUTURA',
    questoes: [
      acordoComoAlternativas(
        'A infraestrutura do Insted oferece condições adequadas para minhas atividades acadêmicas.',
      ),
      {
        enunciado: 'O que mais precisa ser melhorado na infraestrutura?',
        ajuda: 'Responda se há algo a melhorar. Pode marcar mais de uma alternativa.',
        tipo: 'ESCOLHA_MULTIPLA',
        obrigatoria: false,
        peso: 0,
        opcoes: [
          'Climatização',
          'Mobiliário das salas',
          'Iluminação',
          'Acústica',
          'Projetores/equipamentos',
          'Internet/Wi-Fi',
          'Banheiros',
          'Espaços de convivência',
          'Alimentação/cantina',
          'Limpeza',
          'Segurança',
          'Acessibilidade',
          'Outro',
        ],
      },
      acordoComoAlternativas(
        'Os laboratórios utilizados no meu curso oferecem condições, materiais e equipamentos adequados às atividades previstas.',
        'Não utilizei laboratório neste semestre.',
      ),
      acordoComoAlternativas(
        'Os recursos da biblioteca que utilizo atendem às minhas necessidades acadêmicas.',
        'Não utilizei a biblioteca física nem digital neste semestre.',
      ),
    ],
  },
  {
    titulo: 'Ambiente virtual e disciplinas a distância',
    descricao:
      'AVA, materiais e tutoria. Quem não cursou disciplina EAD responde pela categoria própria, sem pontuar.',
    targetType: 'INSTITUICAO',
    questoes: [
      acordoComoAlternativas(
        'O Ambiente Virtual de Aprendizagem (AVA) facilita o acesso aos materiais, orientações e atividades das disciplinas.',
        'Não utilizei o AVA suficientemente para avaliar.',
      ),
      acordoComoAlternativas(
        'Os materiais didáticos utilizados nas disciplinas EAD do meu curso (videoaulas, apostilas, atividades) são claros e de boa qualidade.',
        'Não tive disciplina EAD neste semestre.',
      ),
      acordo(
        'O(A) tutor(a) das disciplinas EAD do meu curso oferece suporte adequado para minha aprendizagem.',
        'Não tive disciplina EAD neste semestre.',
      ),
    ],
  },
  {
    titulo: 'Informação e atendimento',
    descricao: 'Coordenação, secretaria, financeiro e ouvidoria.',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo('Recebo com clareza e em tempo adequado as informações acadêmicas de que preciso.'),
      acordo(
        'Quando preciso resolver uma demanda acadêmica ou administrativa, consigo identificar onde buscar atendimento.',
      ),
      acordo(
        'A coordenação do meu curso oferece orientação e apoio quando preciso.',
        'Não procurei a coordenação neste semestre.',
      ),
      acordo(
        'O atendimento do setor Financeiro (boletos, negociações, bolsas) é satisfatório.',
        'Não utilizei o setor Financeiro neste semestre.',
      ),
      acordo(
        'O atendimento da Secretaria Acadêmica é eficiente.',
        'Não utilizei a Secretaria Acadêmica neste semestre.',
      ),
      acordo(
        'O atendimento da Ouvidoria do Insted é eficiente.',
        'Não utilizei a Ouvidoria neste semestre.',
      ),
    ],
  },
  {
    titulo: 'Ensino e vida acadêmica',
    descricao: 'Percepção geral sobre o ensino, antes da avaliação individual dos professores.',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo(
        'De modo geral, os professores oferecem o suporte necessário para que eu avance na aprendizagem.',
      ),
      acordo(
        'O curso relaciona o que aprendo em sala de aula com situações profissionais, problemas reais ou demandas da sociedade.',
      ),
      acordo('Já participei de atividades de pesquisa e/ou extensão oferecidas pelo curso.'),
      acordo('Sinto que faço parte da comunidade acadêmica do Insted.'),
      acordo(
        'Considerando minha experiência até aqui, o curso tem entregado valor compatível com o investimento necessário para realizá-lo.',
      ),
      aberta(
        'Deseja registrar algum outro comentário sobre a infraestrutura, o atendimento, coordenação de curso, ou qualquer outro aspecto da sua experiência acadêmica no Insted?',
      ),
    ],
  },
  {
    titulo: 'Permanência e recomendação',
    targetType: 'INSTITUICAO',
    questoes: [
      linear(
        'De 0 a 10, qual é a probabilidade de você continuar estudando no Insted no próximo semestre?',
        '0 = nenhuma probabilidade · 10 = certamente continuarei',
      ),
      escolha(
        'Qual fator mais pode dificultar sua permanência no Insted?',
        [
          'Questão financeira',
          'Trabalho ou falta de tempo',
          'Dificuldade de conciliar horários',
          'Dificuldades acadêmicas',
          'Dificuldade com alguma disciplina',
          'Dúvidas em relação ao curso escolhido',
          'Relação com professores',
          'Relação com colegas/turma',
          'Atendimento ou processos institucionais',
          'Deslocamento',
          'Motivos pessoais ou familiares',
          'Pretendo estudar em outra instituição',
          'Outro',
        ],
        {
          ajuda:
            'Responda se a probabilidade acima foi 6 ou menos. Indique apenas o fator principal.',
          obrigatoria: false,
        },
      ),
      linear(
        'De 0 a 10, qual é a probabilidade de você recomendar o Insted a alguém que esteja procurando uma faculdade?',
        '0 = nenhuma probabilidade · 10 = certamente recomendaria',
      ),
      aberta(
        'Se o Insted pudesse melhorar apenas uma coisa na sua experiência acadêmica no próximo semestre, o que deveria ser?',
      ),
    ],
  },
  {
    titulo: 'Avaliação individual do professor',
    descricao:
      'Repetido uma vez por disciplina presencial que você cursa, com o nome do professor e da disciplina. Responda apenas onde houve contato suficiente para avaliar.',
    targetType: 'PROFESSOR_DISCIPLINA',
    repetivel: true,
    targetFiltro: { modalidades: PRESENCIAIS },
    // Não obrigatório: o PDF manda avaliar só quem o aluno conheceu o
    // suficiente. Forçar resposta produziria nota inventada.
    obrigatorio: false,
    questoes: [
      frequencia('Organiza a disciplina e deixa claros os objetivos, atividades e expectativas.'),
      frequencia('Explica os conteúdos de forma que favorece minha compreensão.'),
      frequencia(
        'Propõe atividades, discussões ou situações que ajudam a aplicar o conteúdo à prática.',
      ),
      frequencia(
        'Oferece orientações ou feedbacks que ajudam a melhorar minha aprendizagem.',
      ),
      frequencia(
        'Mantém coerência entre aquilo que é trabalhado na disciplina e aquilo que é exigido nas atividades e avaliações.',
      ),
      linear(
        'De 0 a 10, quanto a atuação deste professor contribuiu para sua aprendizagem nesta disciplina?',
        '0 = não contribuiu para minha aprendizagem · 10 = contribuiu de forma excepcional',
      ),
      aberta('Deseja registrar alguma observação sobre este professor ou disciplina?', 300),
    ],
  },
  {
    titulo: 'Perfil e condições de permanência — módulo anual',
    descricao:
      'MÓDULO ANUAL, não semestral: o PDF recomenda aplicá-lo uma vez por ano para não cansar o formulário principal. A CPA remove este bloco nos ciclos em que não for usá-lo.',
    targetType: 'INSTITUICAO',
    obrigatorio: false,
    questoes: [
      escolha('Atualmente você exerce atividade remunerada?', [
        'Não',
        'Sim, até 20 horas semanais',
        'Sim, de 21 a 30 horas semanais',
        'Sim, de 31 a 40 horas semanais',
        'Sim, mais de 40 horas semanais',
      ]),
      escolha('Quem arca principalmente com os custos da sua graduação?', [
        'Eu mesmo(a)',
        'Pais ou familiares',
        'Eu e familiares dividimos os custos',
        'Bolsa integral',
        'Bolsa parcial / financiamento',
        'Empresa ou instituição',
        'Outro',
      ]),
      escolha('Em média, quanto tempo você leva para chegar ao Insted?', [
        'Até 15 minutos',
        '16 a 30 minutos',
        '31 a 45 minutos',
        '46 a 60 minutos',
        'Mais de 60 minutos',
      ]),
      escolha('Qual é o principal meio de transporte utilizado para chegar ao Insted?', [
        'Carro',
        'Motocicleta',
        'Ônibus/transporte coletivo',
        'Aplicativo/táxi',
        'Bicicleta',
        'A pé',
        'Carona',
        'Outro',
      ]),
      acordo(
        'Conheço a missão e os principais objetivos do Insted, definidos no seu Plano de Desenvolvimento Institucional (PDI).',
      ),
      acordo(
        'O Insted promove ações de inclusão, acessibilidade e responsabilidade social que eu percebo no dia a dia.',
      ),
      acordo(
        'Já participei de pesquisas de autoavaliação institucional (CPA) e percebo que os resultados geram melhorias.',
      ),
    ],
  },
];

const NOME = '2026 Avaliação Institucional — Graduação Presencial';

const DESCRICAO =
  'Instrumento detalhado da CPA para a graduação presencial: escala de concordância de quatro pontos, sem ponto médio. Inclui permanência e recomendação (0 a 10), avaliação individual por professor da turma e um módulo anual de perfil. As duas perguntas condicionais do PDF (melhorias na infraestrutura e fator de risco de evasão) entram como opcionais, porque o sistema ainda não esconde pergunta conforme resposta. ATENÇÃO AO LER O RELATÓRIO: por decisão da CPA, os cinco primeiros itens avaliativos (infraestrutura, laboratórios, biblioteca, AVA e materiais EAD) são lista de alternativas, não escala — contam por alternativa, ficam fora da média e não se comparam com os demais itens, que continuam em escala de 1 a 4.';

const ABERTURA =
  'Sua participação ajuda o Insted a identificar o que está funcionando e o que precisa ser melhorado na experiência acadêmica. O questionário é anônimo e leva de 3 a 4 minutos. Ao final, você poderá avaliar individualmente os professores com quem teve contato neste semestre. Responda considerando sua experiência neste semestre.';

// ────────────────────────────────────────────────────────────── gravação

async function main(): Promise<void> {
  log(`\n${NOME}\n`);

  const existente = await prisma.formTemplate.findFirst({
    where: { nome: NOME, versao: 1 },
    select: { id: true, status: true },
  });

  if (existente?.status && existente.status !== 'RASCUNHO') {
    log('⏭  Já publicado — não sobrescrevo instrumento em uso.');
    log('    Para uma revisão, crie a versão 2 pelo painel.\n');
    return;
  }

  // Rascunho é substituído por inteiro: blocos e questões caem em cascata.
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
        repetivel: b.repetivel ?? false,
        targetFiltro: b.targetFiltro ?? undefined,
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
            // `valor` fica nulo: são alternativas nominais, sem ordem de
            // mérito. Somar "Carro" com "Bicicleta" não quer dizer nada.
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
  log('    · "O que mais precisa ser melhorado" e "fator que dificulta a');
  log('      permanência" aparecem para todos, como opcionais — o sistema');
  log('      ainda não esconde pergunta conforme a resposta anterior.');
  log('    · A turma é digitada pelo aluno; não há lista automática por curso.');
  log('    · O módulo anual de perfil é o último bloco: remova-o nos ciclos');
  log('      em que não for aplicá-lo.');
  log('    · Infraestrutura, laboratórios, biblioteca, AVA e materiais EAD são');
  log('      LISTA DE ALTERNATIVAS, não escala: contam por opção e ficam fora');
  log('      da média. Os demais itens seguem em escala de 1 a 4.');
  log('    · Curso e turma ficam gravados junto das respostas. Em turma');
  log('      pequena, isso estreita o cerco sobre quem respondeu.');
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
