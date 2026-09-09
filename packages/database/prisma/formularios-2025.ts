/**
 * Carga dos formulários reais da CPA — ciclo 2025.
 *
 * Transcreve os três Google Forms do Drive da CPA para o motor de formulários,
 * na redação ORIGINAL. Nada foi reescrito, reordenado ou deduplicado: o
 * objetivo é a CPA ver na interface exatamente o que aplicou em 2025 e decidir
 * o que muda a partir daí. Os defeitos conhecidos (perguntas repetidas,
 * numeração fora de ordem) estão marcados na descrição do bloco.
 *
 * Idempotente e NÃO destrutivo: recria apenas estes formulários, sem tocar em
 * usuários, turmas ou dados do JACAD.
 *
 * Rodar:  npm run db:formularios
 *
 * Ver docs/06-questionarios-atuais.md.
 */
import { PrismaClient, QuestionType, TargetType, FormAudience, FormStatus } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------- escalas

/** Discentes: rótulos textuais, com "Não se aplica". */
const ESCALA_DISCENTE = {
  min: 1,
  max: 5,
  labels: { '1': 'Ruim', '2': 'Regular', '3': 'Bom', '4': 'Muito bom', '5': 'Excelente' },
  permiteNaoSeAplica: true,
};

/** Docentes, item 14 — única legenda explicitada no formulário docente. */
const ESCALA_SATISFACAO = {
  min: 1,
  max: 5,
  labels: {
    '1': 'Muito insatisfatório',
    '2': 'Insatisfatório',
    '3': 'Adequado',
    '4': 'Satisfatório',
    '5': 'Muito satisfatório',
  },
  permiteNaoSeAplica: false,
};

/**
 * Docentes, demais blocos: as respostas são numéricas 1–5, mas o cabeçalho
 * exportado não traz a legenda textual. Marcada como pendente para a CPA
 * confirmar no Google Form original antes de publicar.
 */
const ESCALA_1_5_SEM_LEGENDA = {
  min: 1,
  max: 5,
  legendaPendenteConfirmacao: true,
  permiteNaoSeAplica: false,
};

/** Técnico-administrativo: legenda vinha embutida no enunciado. */
const ESCALA_SUFICIENCIA = {
  min: 1,
  max: 5,
  labels: {
    '1': 'Muito insuficiente',
    '2': 'Insuficiente',
    '3': 'Adequado',
    '4': 'Bom',
    '5': 'Excelente',
  },
  permiteNaoSeAplica: false,
};

/** Idem, mas com o "0 - Não se aplica" que o bloco 17 oferece. */
const ESCALA_SUFICIENCIA_NA = { ...ESCALA_SUFICIENCIA, permiteNaoSeAplica: true };

const NPS = { min: 0, max: 10 };
const TEXTO = { maxLength: 500 };

// ---------------------------------------------------------------- helpers

type Q = {
  enunciado: string;
  tipo?: QuestionType;
  config?: object;
  obrigatoria?: boolean;
  peso?: number;
  ajuda?: string;
};

type B = {
  titulo: string;
  descricao?: string;
  targetType: TargetType;
  repetivel?: boolean;
  questoes: Q[];
};

/** Monta o payload aninhado de um formulário a partir da lista de blocos. */
function montar(blocos: B[]) {
  return blocos.map((b, i) => ({
    titulo: b.titulo,
    descricao: b.descricao ?? null,
    ordem: i + 1,
    targetType: b.targetType,
    repetivel: b.repetivel ?? false,
    questoes: {
      create: b.questoes.map((q, j) => ({
        enunciado: q.enunciado,
        ajuda: q.ajuda ?? null,
        tipo: q.tipo ?? QuestionType.LIKERT,
        ordem: j + 1,
        obrigatoria: q.obrigatoria ?? true,
        peso: q.peso ?? 1,
        config: (q.config ?? ESCALA_DISCENTE) as object,
      })),
    },
  }));
}

/** Texto livre opcional — não entra na média (peso 0). */
const dissertativa = (enunciado: string, ajuda?: string): Q => ({
  enunciado,
  tipo: QuestionType.TEXTO_LIVRE,
  obrigatoria: false,
  peso: 0,
  config: TEXTO,
  ajuda,
});

// ============================================================ DISCENTES

const DISCENTES: B[] = [
  {
    titulo: 'Infraestrutura',
    descricao: 'Itens 1 a 5 do formulário de 2025.',
    targetType: TargetType.INFRAESTRUTURA,
    questoes: [
      { enunciado: 'Como você avalia a infraestrutura das salas de aula (iluminação, ventilação, cadeiras, quadros, projetores, etc.)?' },
      { enunciado: 'Como você avalia o acesso à biblioteca (física e/ou digital), em termos de acervo, espaço e recursos disponíveis?' },
      { enunciado: 'Como você avalia a estrutura e os equipamentos dos laboratórios utilizados em seu curso (se aplicável)?' },
      { enunciado: 'Como você avalia os espaços de convivência (cantina, banheiros, conectividade, etc.) da faculdade?' },
      { enunciado: 'Considerando o ambiente geral da instituição (limpeza, sinalização, acessibilidade, segurança, manutenção), como você o avalia?' },
    ],
  },
  {
    titulo: 'Corpo docente',
    descricao:
      'Itens 6 a 10 do formulário de 2025. ATENÇÃO: no instrumento original as ' +
      'perguntas são genéricas ("os professores", no plural) e respondidas uma ' +
      'única vez — não há nota por docente. Para avaliar professor a professor, ' +
      'duplique este formulário e marque o bloco como repetível com alvo ' +
      'PROFESSOR_DISCIPLINA. É decisão de política da CPA.',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Como você avalia o domínio do conteúdo demonstrado pelos professores nas disciplinas?' },
      { enunciado: 'Como você avalia a didática utilizada pelos professores para facilitar a compreensão dos conteúdos?' },
      { enunciado: 'Como você avalia a articulação do professor com o ambiente virtual (AVA) para a promoção das aulas?' },
      { enunciado: 'Como você avalia o comprometimento dos professores com o processo de ensino-aprendizagem?' },
      { enunciado: 'Como você avalia a qualificação e diversidade do corpo docente (formação acadêmica, experiências profissionais, atuação em diferentes áreas)?' },
    ],
  },
  {
    titulo: 'Comentários',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      dissertativa(
        'Deixe alguma sugestão, consideração ou elogio sobre a infraestrutura, o corpo docente ou qualquer outra área da faculdade.',
        'Até 500 caracteres. Preenchimento opcional. Por favor, não se identifique.',
      ),
    ],
  },
];

// ============================================================== DOCENTES

const DOCENTES: B[] = [
  {
    titulo: 'Perfil',
    descricao:
      'RISCO DE REIDENTIFICAÇÃO: ano de contratação + ano de nascimento + cursos ' +
      'identifica boa parte dos 88 docentes. Avaliar remoção ou uso de faixas amplas.',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Em qual ou quais Cursos atua ou já atuou?', tipo: QuestionType.TEXTO_LIVRE, peso: 0, config: { maxLength: 200 } },
      { enunciado: 'Quando foi contratado pela Faculdade INSTED? (exemplo: 2021/2)', tipo: QuestionType.TEXTO_LIVRE, peso: 0, config: { maxLength: 20 } },
      { enunciado: 'Em que ano você nasceu?', tipo: QuestionType.TEXTO_LIVRE, peso: 0, config: { maxLength: 20 } },
    ],
  },
  {
    titulo: 'Metodologias ativas',
    descricao: 'Numeração original inconsistente: o formulário traz dois itens "3".',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Desde que foi contratado, teve algum treinamento ou capacitação em Metodologias Ativas?', tipo: QuestionType.ESCOLHA_MULTIPLA, peso: 0, config: {} },
      { enunciado: 'Qual seu nível de preparo e utilização das Metodologias Ativas?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      dissertativa('Gostaríamos de um breve relato sobre sua visão da utilização das Metodologias ativas em suas disciplinas.'),
    ],
  },
  {
    titulo: 'Recomendação',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Em uma nota de 0 a 10, quanto você indicaria a nossa faculdade a um amigo ou familiar?', tipo: QuestionType.NPS, config: NPS },
    ],
  },
  {
    titulo: 'Autoavaliação — planejamento e condução (7)',
    descricao: 'Escala 1–5. Legenda textual não constava no cabeçalho exportado — confirmar no formulário original.',
    targetType: TargetType.AUTOAVALIACAO,
    questoes: [
      { enunciado: 'Quão bem você apresentou e discutiu o Plano de Ensino e Aprendizagem (PEA) no início do semestre?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem você cumpriu e avaliou o Plano de Ensino ao final do semestre?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão atualizado e cumprido foi o conteúdo proposto no Plano de Ensino?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão seguro(a) você se sente na transmissão dos conhecimentos durante as aulas?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão clara foi a condução das aulas para o desenvolvimento dos assuntos propostos?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem planejadas e preparadas foram suas aulas?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem você desenvolveu as avaliações como parte do processo de ensino-aprendizagem?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficazes e diversificadas foram as formas que você utilizou para promover a aprendizagem ativa dos estudantes?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão frequentemente você participou das formações em Metodologias Ativas oferecidas pela Instituição?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem organizada foi a preparação prévia da sala de aula invertida?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem você cumpriu os prazos solicitados pela Coordenação de Curso?', config: ESCALA_1_5_SEM_LEGENDA },
    ],
  },
  {
    titulo: 'Autoavaliação — relação com os discentes (8)',
    targetType: TargetType.AUTOAVALIACAO,
    questoes: [
      { enunciado: 'Quão bem a relação docente-discente favoreceu o aprendizado dos alunos?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficaz foi o ambiente de sala de aula em favorecer o debate de ideias?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem você discutiu os erros e acertos dos discentes como forma de encorajamento no seu desenvolvimento?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficazmente você respondeu aos questionamentos dos discentes?', config: ESCALA_1_5_SEM_LEGENDA },
    ],
  },
  {
    titulo: 'Autoavaliação — práticas de aprendizagem ativa (9)',
    targetType: TargetType.AUTOAVALIACAO,
    questoes: [
      { enunciado: 'Quão eficaz foi a apresentação de situações reais para favorecer a aprendizagem ativa dos estudantes?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficaz foi a apresentação de situações-problema e a discussão das possíveis soluções para o aprendizado dos estudantes?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão bem você promoveu, no início do semestre, a importância do módulo e sua relação com outras áreas do conhecimento?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficaz foi o incentivo dado ao discente para desenvolver a capacidade de contextualização dos conteúdos ministrados, bem como o uso do raciocínio e criatividade para a solução de problemas?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficaz você foi no incentivo a busca de capacitações pelos discentes fora de sala de aula?', config: ESCALA_1_5_SEM_LEGENDA },
    ],
  },
  {
    titulo: 'Autoavaliação — postura (10)',
    targetType: TargetType.AUTOAVALIACAO,
    questoes: [
      { enunciado: 'Procedimento e postura frente ao comportamento inadequado dos discentes?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Comprometimento em valorizar o desenvolvimento dos discentes para a efetiva aprendizagem no módulo?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Respeito ao horário de início e término das aulas?', config: ESCALA_1_5_SEM_LEGENDA },
      dissertativa('Deseja fazer algum comentário sobre sua AUTO AVALIAÇÃO?', 'Pode descrever opinião sobre pontos não abordados, ou justificar alguma resposta.'),
    ],
  },
  {
    titulo: 'Conhecimento institucional (12)',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Qual é o seu grau de conhecimento do PDI (Plano de Desenvolvimento Institucional) da Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Qual é o seu grau de conhecimento do PPC (Projeto Pedagógico de Curso) do(s) curso(s) em que você atua ou já atuou na Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão eficaz é a prática de gestão compartilhada na tomada de decisões pela sua Coordenação de Curso?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Quão clara é comunicada ao docente a sistemática de atividades acadêmicas da Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Qual é o seu grau de conhecimento do Plano de Carreira Docente da Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a existência de um ambiente propício para o seu desenvolvimento profissional na Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
    ],
  },
  {
    titulo: 'Atuação dos setores (13)',
    descricao:
      'Uma pergunta por setor, como no original. O motor permite converter este ' +
      'bloco em repetível com alvo DEPARTAMENTO — uma pergunta e um card por setor.',
    targetType: TargetType.DEPARTAMENTO,
    questoes: [
      { enunciado: 'Como você avalia a atuação da Diretoria da Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da sua Coordenação de Curso?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação do NDE (Núcleo Docente Estruturante) na melhoria do curso?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da equipe de TI?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da equipe da Biblioteca?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da Coordenação do Curso no desenvolvimento do PPC (Projeto Pedagógico do Curso)?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da equipe de apoio de serviços gerais (limpeza/organização) da Faculdade Insted?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da equipe da Secretaria Acadêmica no atendimento aos Professores?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da equipe da Secretaria Acadêmica no atendimento aos Estudantes?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação da equipe dos setores Administrativo e Financeiro?', config: ESCALA_1_5_SEM_LEGENDA },
      { enunciado: 'Como você avalia a atuação do Setor de Recursos Humanos (RH)?', config: ESCALA_1_5_SEM_LEGENDA },
    ],
  },
  {
    titulo: 'Espaços físicos (14)',
    descricao:
      'DUPLICADO: estas sete perguntas reaparecem quase idênticas no bloco 16. ' +
      'No formulário original os docentes respondem duas vezes. Consolidar.',
    targetType: TargetType.INFRAESTRUTURA,
    questoes: [
      { enunciado: 'Como você avalia a quantidade e a qualidade dos equipamentos tecnológicos disponíveis para o desenvolvimento de suas funções?', config: ESCALA_SATISFACAO },
      { enunciado: 'Como você avalia a qualidade da iluminação no recinto de trabalho?', config: ESCALA_SATISFACAO },
      { enunciado: 'Como você avalia o sistema de refrigeração e a ventilação no ambiente de trabalho?', config: ESCALA_SATISFACAO },
      { enunciado: 'Como você avalia a qualidade e suficiência do mobiliário para desempenhar suas atividades?', config: ESCALA_SATISFACAO },
      { enunciado: 'Como você avalia as condições de acessibilidade para pessoas com deficiência, incluindo banheiros especiais?', config: ESCALA_SATISFACAO },
      { enunciado: 'Como você avalia as condições sanitárias e de limpeza dos banheiros?', config: ESCALA_SATISFACAO },
      { enunciado: 'Como você avalia o espaço físico e a ambientação adequados para o intervalo das aulas no ambiente dos docentes?', config: ESCALA_SATISFACAO },
    ],
  },
  {
    titulo: 'Percepção institucional (15)',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      'Estou ciente do Plano de Desenvolvimento Institucional (PDI) da Faculdade INSTED',
      'A coordenação do meu curso pratica a gestão compartilhada nas decisões acadêmicas',
      'As atividades acadêmicas são planejadas de forma eficiente e sistemática',
      'A instituição promove ações eficazes de interação social com a comunidade',
      'A instituição implementa políticas efetivas para a inclusão social, incluindo a admissão de pessoas com deficiência',
      'A instituição implementa bem as ações voltadas à promoção da cidadania',
      'Estou informado sobre o plano de carreira docente e suas possibilidades de progressão',
      'A Faculdade oferece um ambiente propício para meu desenvolvimento profissional',
      'O corpo diretivo da Faculdade atua de forma eficaz em suas funções',
      'A coordenação do meu curso é eficiente na gestão e suporte acadêmico',
      'O Núcleo Docente Estruturante (NDE) contribui significativamente para a melhoria do curso',
      'O setor de informática (TI) atende adequadamente às demandas tecnológicas do curso',
      'O responsável pela biblioteca desempenha suas funções de forma eficiente',
      'A coordenação está envolvida de maneira efetiva no desenvolvimento do Projeto Pedagógico do Curso (PPC)?',
      'Os funcionários de apoio desempenham suas funções de forma eficiente?',
      'Os funcionários da Secretaria Acadêmica são acessíveis e prestativos',
      'O acervo bibliográfico atende satisfatoriamente às necessidades de estudos do curso?',
      'As salas de aula possuem infraestrutura adequada para as atividades acadêmicas',
      'A infraestrutura tecnológica disponibilizada é adequada para as atividades do curso?',
      'Os serviços de apoio disponibilizados no site são eficientes e de fácil acesso?',
      'Os laboratórios possuem equipamentos suficientes para atender ao número de discentes?',
      'A limpeza das instalações físicas é satisfatória?',
    ].map((enunciado) => ({ enunciado, config: ESCALA_1_5_SEM_LEGENDA })),
  },
  {
    titulo: 'Ambiente de trabalho (16)',
    descricao: 'DUPLICADO do bloco 14, com a redação em primeira pessoa. Consolidar com o 14.',
    targetType: TargetType.INFRAESTRUTURA,
    questoes: [
      'Os equipamentos tecnológicos disponíveis são adequados em quantidade e qualidade para o desenvolvimento das minhas funções?',
      'A iluminação no meu local de trabalho é adequada para a realização das minhas atividades?',
      'O sistema de refrigeração ou ventilação no recinto de trabalho é eficiente e proporciona um ambiente confortável?',
      'O mobiliário disponível no local de trabalho é de qualidade e adequado para a execução das minhas atividades?',
      'As condições de acessibilidade para pessoas com deficiência, incluindo banheiros especiais, são adequadas?',
      'Os banheiros da instituição estão em boas condições sanitárias?',
      'O espaço físico e a ambientação disponível para os docentes no horário de intervalo das aulas são adequados?',
    ]
      .map((enunciado) => ({ enunciado, config: ESCALA_1_5_SEM_LEGENDA }) as Q)
      .concat([dissertativa('Deseja fazer algum comentário sobre os quesitos acima?', 'Aproveite para nos explicar, caso haja alguma insatisfação.')]),
  },
  {
    titulo: 'Avaliação dos discentes (18)',
    descricao: 'O docente avalia a turma — não há equivalente no formulário do aluno.',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      'A maioria dos alunos possui uma base de conhecimento anterior adequada para a compreensão do meu módulo',
      'A maioria dos discentes demonstra motivação para os estudos diários relacionados ao meu módulo',
      'Os discentes compreendem bem os textos e conteúdos teóricos envolvidos no meu módulo',
      'Os discentes aproveitam bem o tempo disponíveis durante as aulas',
      'Os discentes dedicam tempo suficiente para o estudo do módulo sob minha responsabilidade',
      'Os discentes demonstram competência e habilidades adequadas na solução de situações-problema durante as avaliações',
      'Os discentes demonstram interesse pelo conteúdo do meu módulo',
      'A participação dos discentes nas atividades do meu módulo é satisfatória',
    ]
      .map((enunciado) => ({ enunciado, config: ESCALA_1_5_SEM_LEGENDA }) as Q)
      .concat([
        dissertativa('Deseja fazer algum comentário sobre avaliação dos discentes?'),
        dissertativa('Deixe alguma sugestão, consideração ou elogio.', 'Até 500 caracteres. Opcional. Favor não se identificar.'),
      ]),
  },
];

// ================================================ TÉCNICO-ADMINISTRATIVO

const TECNICO: B[] = [
  {
    titulo: 'Perfil',
    descricao:
      'RISCO DE REIDENTIFICAÇÃO ALTO: gênero + ano de nascimento + estado civil + ' +
      'cor/raça + escolaridade identifica praticamente qualquer respondente num ' +
      'quadro pequeno — e o bloco 17 pede avaliação de diretores nominalmente. ' +
      'Recomendação: remover ou converter em faixas amplas.',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Qual é o seu gênero?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Em que ano você nasceu?', tipo: QuestionType.TEXTO_LIVRE, peso: 0, config: { maxLength: 20 } },
      { enunciado: 'Qual o seu estado civil?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Com relação à sua cor ou raça, como você se considera?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Até que etapa de escolarização você concluiu?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
    ],
  },
  {
    titulo: 'Atendimento ao público',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Com qual frequência você atende ou tem contato com Estudantes?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Com qual frequência você atende ou tem contato com Professores?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Com qual frequência você atende ou tem contato com Colaboradores?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Com qual frequência você atende ou tem contato com outros públicos?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
      { enunciado: 'Caso atenda um ou mais públicos citados anteriormente, como se sente com relação a esse atendimento?', tipo: QuestionType.ESCOLHA_UNICA, peso: 0, config: {} },
    ],
  },
  {
    titulo: 'Autoavaliação (8)',
    targetType: TargetType.AUTOAVALIACAO,
    questoes: [
      'Meu nível de motivação para realizar meu trabalho é...',
      'Meu nível de compreensão sobre meu papel na instituição é...',
      'O aproveitamento do meu tempo durante o expediente é...',
      'Meu esforço para aprender e me adaptar às tarefas do meu setor é...',
      'A qualidade do meu relacionamento com os colegas do meu setor é...',
      'A qualidade do meu relacionamento com colegas de outros setores da instituição é...',
      'Minha pontualidade em relação a compromissos e atividades é...',
      'Minhas competências e habilidades na solução de problemas no dia a dia são...',
      'Meu conhecimento sobre as atividades de outros setores e sobre as atualizações da faculdade é...',
    ]
      .map((enunciado) => ({ enunciado, config: ESCALA_SUFICIENCIA }) as Q)
      .concat([
        dissertativa('Nos diga qual(is) treinamento(s) gostaria de participar que acredita irá MELHORAR seu desempenho profissional e/ou pessoal.'),
        dissertativa('Deseja fazer algum comentário sobre sua atuação/auto avaliação na Instituição?'),
      ]),
  },
  {
    titulo: 'Recomendação',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      { enunciado: 'Em uma nota de 0 a 10, quanto você indicaria a nossa faculdade a um amigo ou familiar?', tipo: QuestionType.NPS, config: NPS },
    ],
  },
  {
    titulo: 'Percepção institucional (12)',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      'O nível de reconhecimento da Faculdade Insted pela comunidade acadêmica é...',
      'O nível de reconhecimento da Faculdade Insted pela comunidade externa é...',
      'As condições ambientais da minha sala de trabalho (mobiliário, ventilação, iluminação, etc.) são...',
      'O nível de segurança das instalações da Instituição é...',
      'O nível de segurança no entorno da Instituição é...',
      'A qualidade dos serviços de apoio ao colaborador oferecidos pela Instituição é...',
      'A qualidade da atuação da diretoria da Instituição é...',
      'O apoio oferecido pela Instituição para meu aperfeiçoamento e estudos é...',
      'A qualidade da limpeza e conservação das instalações físicas da Instituição é...',
      'A sistemática de comunicação e troca de informações da Instituição com os colaboradores é...',
      'A qualidade e frequência dos eventos e iniciativas de Responsabilidade Social promovidos pela Instituição são...',
    ]
      .map((enunciado) => ({ enunciado, config: ESCALA_SUFICIENCIA }) as Q)
      .concat([dissertativa('Deseja fazer algum comentário sobre a Instituição?')]),
  },
  {
    titulo: 'Gestão e clima (14)',
    targetType: TargetType.INSTITUICAO,
    questoes: [
      'Eu tenho clareza sobre o que a instituição espera do meu trabalho.',
      'Eu compreendo as expectativas da instituição quanto ao futuro da Faculdade Insted.',
      'Sei claramente o que meu gestor espera em termos de resultados do meu trabalho.',
      'Os materiais e recursos que preciso para desempenhar bem minhas funções estão disponíveis.',
      'Eu me sinto apoiado pela instituição para realizar meu melhor trabalho diariamente.',
      'Eu tenho clareza sobre as funções que devo desempenhar.',
      'Minha chefia imediata demonstra preocupação com meu bem-estar pessoal.',
      'Há alguém na instituição que apoia e incentiva meu desenvolvimento profissional.',
      'Eu me sinto ouvido e considerado pela minha chefia imediata.',
      'Eu me sinto ouvido e considerado pelos meus colegas de trabalho.',
      'A instituição me faz sentir que meu trabalho é valorizado e importante.',
      'Eu percebo que meus colegas estão comprometidos com a qualidade do trabalho em equipe.',
      'No último ano, tive oportunidades de aprendizado e crescimento dentro da instituição.',
    ]
      .map((enunciado) => ({ enunciado, config: ESCALA_SUFICIENCIA }) as Q)
      .concat([
        dissertativa('Deseja fazer algum comentário sobre a Gestão?', 'Aqui é o lugar para descrever algo bom ou ruim e justificar suas respostas, se desejar.'),
        {
          enunciado: 'De forma geral, como você avalia sua satisfação no trabalho?',
          ajuda: '1 - completamente insatisfeito · 5 - completamente satisfeito',
          config: { min: 1, max: 5, labels: { '1': 'Completamente insatisfeito', '5': 'Completamente satisfeito' } },
        },
      ]),
  },
  {
    titulo: 'Contato com setores e gestores (17)',
    descricao:
      'No original, dois itens citam diretores pelo nome. Combinado com o bloco ' +
      'de perfil, isso desestimula resposta franca. Avaliar substituir por cargo.',
    targetType: TargetType.DEPARTAMENTO,
    questoes: [
      'Como você avalia seu contato e grau de resolução de problemas com os diretores: Neca e Fernando',
      'Como você avalia seu contato e grau de resolução de problemas com o diretor: Marcelo Salomão',
      'Como você avalia seu contato e grau de resolução de problemas com o setor financeiro',
      'Como você avalia seu contato e grau de resolução de problemas com o setor comercial.',
      'Como você avalia seu contato e grau de resolução de problemas com o setor de TI',
      'Como você avalia seu contato e grau de resolução de problemas com o setor da secretaria acadêmica.',
      'Como você avalia seu contato e grau de resolução de problemas com o setor pedagógico',
      'Como você avalia seu contato e grau de resolução de problemas com o setor de organização estrutural e limpeza',
      'Como você avalia seu contato e grau de resolução de problemas com o setor da pós-graduação',
      'Como você avalia seu contato e grau de resolução de problemas com o setor de marketing',
      'Como você avalia seu contato e grau de resolução de problemas com o setor de RH (Recursos Humanos)',
      'Como você avalia seu contato e grau de resolução de problemas com a ouvidoria',
      'Como você avalia seu contato e grau de resolução de problemas com a portaria',
    ]
      .map((enunciado) => ({ enunciado, config: ESCALA_SUFICIENCIA_NA }) as Q)
      .concat([
        dissertativa('Deseja fazer algum comentário sobre os Setores e seus gestores?', 'Caso queira explicar sua nota — pode ser elogio ou reclamação.'),
        { enunciado: 'Você sabe qual a importância da CPA (Comissão Própria de Avaliação)?', tipo: QuestionType.SIM_NAO, peso: 0, config: {} },
      ]),
  },
];

// ------------------------------------------------------------------ carga

async function carregar(nome: string, descricao: string, publico: FormAudience, blocos: B[]) {
  // Recria só este formulário. O cascade limpa blocos e questões antigos.
  const existente = await prisma.formTemplate.findUnique({
    where: { nome_versao: { nome, versao: 1 } },
    select: { id: true },
  });
  if (existente) await prisma.formTemplate.delete({ where: { id: existente.id } });

  const form = await prisma.formTemplate.create({
    data: {
      nome,
      descricao,
      publico,
      versao: 1,
      status: FormStatus.RASCUNHO, // a CPA revisa antes de publicar
      blocos: { create: montar(blocos) },
    },
    include: { blocos: { include: { questoes: true } } },
  });

  const total = form.blocos.reduce((s, b) => s + b.questoes.length, 0);
  console.log(`  ${nome}`);
  console.log(`    ${form.blocos.length} blocos · ${total} questões`);
  return total;
}

/**
 * Setores citados nominalmente nos blocos 13 (docentes) e 17 (técnico-adm).
 * Viram `Department`, que é o alvo dos blocos com TargetType.DEPARTAMENTO —
 * é o que permite, no futuro, trocar 13 perguntas repetidas por uma pergunta
 * repetida em 13 cards.
 */
const SETORES: [string, string][] = [
  ['DIR', 'Diretoria'],
  ['COORD', 'Coordenação de Curso'],
  ['NDE', 'Núcleo Docente Estruturante'],
  ['TI', 'Tecnologia da Informação'],
  ['BIB', 'Biblioteca'],
  ['SEC', 'Secretaria Acadêmica'],
  ['FIN', 'Financeiro'],
  ['ADM', 'Administrativo'],
  ['RH', 'Recursos Humanos'],
  ['COM', 'Comercial'],
  ['PED', 'Pedagógico'],
  ['POS', 'Pós-graduação'],
  ['MKT', 'Marketing'],
  ['OUV', 'Ouvidoria'],
  ['PORT', 'Portaria'],
  ['SGER', 'Serviços gerais (limpeza e organização)'],
];

async function carregarSetores() {
  for (const [sigla, nome] of SETORES) {
    await prisma.department.upsert({
      where: { sigla },
      create: { sigla, nome },
      update: { nome },
    });
  }
  console.log(`  ${SETORES.length} setores avaliáveis cadastrados.\n`);
}

async function main() {
  console.log('\n📋 Carregando os formulários da CPA 2025...\n');
  await carregarSetores();

  const a = await carregar(
    '2025 Avaliação Institucional — Discentes',
    'Instrumento aplicado aos alunos de graduação no ciclo 2025.',
    FormAudience.ALUNO,
    DISCENTES,
  );
  const b = await carregar(
    '2025 Avaliação Institucional — Docentes',
    'Instrumento aplicado ao corpo docente no ciclo 2025.',
    FormAudience.PROFESSOR,
    DOCENTES,
  );
  const c = await carregar(
    '2025 Avaliação Institucional — Técnico-Administrativo',
    'Instrumento aplicado aos colaboradores técnico-administrativos no ciclo 2025.',
    FormAudience.TECNICO_ADMIN,
    TECNICO,
  );

  console.log(`\n  Total: ${a + b + c} questões em 3 formulários.`);
  console.log('\n  Os três entram como RASCUNHO — a CPA revisa e publica pelo painel.');
  console.log('  Pontos marcados para revisão estão na descrição de cada bloco.\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
