/**
 * Avaliação Institucional — Técnico-Administrativo (instrumento 2026.2).
 *
 *   npm run db:formulario-tecnico
 *   npm run homolog -- formulario-tecnico
 *
 * Transcrito da VERSÃO FINAL da CPA:
 * `Questionario_Tecnico_Administrativo_INSTED_CPA.docx` — autoavaliação do
 * colaborador, avaliação da instituição, da gestão e dos setores.
 *
 * Existe porque a versão que entrou por conversão automática do PDF
 * (`formularios-2026.ts`, "2026 Avaliação Institucional — Técnico-Administrativo")
 * saiu quebrada e desatualizada: perguntas do perfil repetidas dentro da
 * auto-avaliação, setores sem alternativas, escala diferente da final. O
 * instrumento anterior não é apagado; o ciclo passa a usar este.
 *
 * Escalas, como no documento:
 *
 * - qualidade, quatro pontos sem ponto médio: Muito insuficiente, Insuficiente,
 *   Bom, Excelente — em todos os blocos, inclusive a gestão, por pedido da CPA;
 * - satisfação geral: Completamente insatisfeito, Insatisfeito, Satisfeito,
 *   Completamente satisfeito;
 * - NPS de 0 a 10, opcional;
 * - setores: "Não se aplica" é categoria separada e fica FORA da média.
 *
 * Entra como RASCUNHO. Ninguém responde nada até a CPA publicar pelo painel.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

/** Quatro pontos, sem ponto médio. */
const QUALIDADE = {
  min: 1,
  max: 4,
  labels: { 1: 'Muito insuficiente', 2: 'Insuficiente', 3: 'Bom', 4: 'Excelente' },
};

const FREQUENCIA = {
  min: 1,
  max: 4,
  labels: { 1: 'Nenhuma', 2: 'Pouca', 3: 'Regularmente', 4: 'Muita' },
};

const SATISFACAO = {
  min: 1,
  max: 4,
  labels: {
    1: 'Completamente insatisfeito',
    2: 'Insatisfeito',
    3: 'Satisfeito',
    4: 'Completamente satisfeito',
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

const qualidade = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...QUALIDADE },
});

/** Item de setor: "Não se aplica" fica fora da média. */
const setor = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: {
    ...QUALIDADE,
    permiteNaoSeAplica: true,
    rotuloNaoSeAplica: 'Não se aplica (quando não utilizo ou não sei opinar)',
  },
});

/** Pergunta de perfil ou de situação: não entra em nenhuma média. */
const escolha = (enunciado: string, opcoes: string[]): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  opcoes,
  peso: 0,
});

/** "Resposta longa • Opcional". */
const aberta = (enunciado: string, ajuda?: string): Q => ({
  enunciado,
  ajuda,
  tipo: 'TEXTO_LIVRE',
  config: { maxLength: 1000 },
  obrigatoria: false,
  peso: 0,
});

/** Uma linha da grade de frequência do documento (o sistema não tem grade). */
const contato = (publico: string): Q => ({
  enunciado: `Com qual frequência você atende ou tem contato com: ${publico}`,
  tipo: 'LIKERT',
  config: { ...FREQUENCIA },
  peso: 0,
});

const BLOCOS: Bloco[] = [
  {
    titulo: 'Identificação',
    descricao:
      'Quem responde. O questionário é anônimo: o sistema não liga a resposta a quem a enviou.',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Qual é o seu gênero?', ['Masculino', 'Feminino', 'Prefiro não informar', 'Outro']),
      escolha('Em que ano você nasceu?', [
        'Entre 1946 e 1964',
        'Entre 1965 e 1980',
        'Entre 1981 e 1996',
        'Entre 1997 e 2010',
        'A partir de 2010',
      ]),
      escolha('Até que etapa de escolarização você concluiu?', [
        'Nenhuma',
        'Ensino Fundamental I: 1º ao 5º ano',
        'Ensino Fundamental II: 6º ao 9º ano',
        'Ensino Médio Incompleto',
        'Ensino Médio Completo',
        'Ensino Superior – Graduação Completo',
        'Pós-graduação Lato Sensu',
        'Pós-graduação Stricto Sensu',
        'Doutorado',
        'Outro',
      ]),
      contato('Estudantes'),
      contato('Professores'),
      contato('Colaboradores'),
      contato('Outros públicos'),
      escolha(
        'Caso atenda um ou mais públicos citados anteriormente, como se sente com relação a esse atendimento?',
        [
          'Não atendo nenhum público citado',
          'Sinto-me completamente preparado para o atendimento que realizo',
          'Sinto-me preparado, mas sinto que preciso melhorar em alguns aspectos que dependem de mim mesmo',
          'Sinto-me preparado, mas gostaria de mais treinamento na função específica que exerço',
          'Não me sinto preparado, preciso de treinamento',
          'Outro',
        ],
      ),
    ],
  },

  {
    titulo: 'Seção 1 — Autoavaliação como colaborador(a)',
    targetType: 'AUTOAVALIACAO',
    questoes: [
      qualidade('Meu nível de motivação para realizar meu trabalho é...'),
      qualidade('Meu nível de compreensão sobre meu papel na instituição é...'),
      qualidade('O aproveitamento do meu tempo durante o expediente é...'),
      qualidade('Meu esforço para aprender e me adaptar às tarefas do meu setor é...'),
      qualidade('A qualidade do meu relacionamento com os colegas do meu setor é...'),
      qualidade('A qualidade do meu relacionamento com colegas de outros setores da instituição é...'),
      qualidade('Minha pontualidade em relação a compromissos e atividades é...'),
      qualidade('Minhas competências e habilidades na solução de problemas no dia a dia são...'),
      qualidade(
        'Meu conhecimento sobre as atividades de outros setores e sobre as atualizações da faculdade é...',
      ),
      aberta(
        'Quais treinamentos você gostaria de participar, que acredita que vão melhorar seu desempenho profissional e/ou pessoal?',
      ),
      aberta('Deseja fazer algum comentário sobre sua atuação/autoavaliação na Instituição?'),
    ],
  },

  {
    // No documento o NPS está no fim da Seção 1. Fica em bloco próprio porque o
    // bloco acima é de AUTOAVALIAÇÃO e a nota é sobre a Faculdade.
    titulo: 'Indicação da Faculdade',
    targetType: 'INSTITUICAO',
    obrigatorio: false,
    questoes: [
      {
        enunciado:
          'Em uma nota de 0 a 10, quanto você indicaria a nossa Faculdade a um amigo ou familiar?',
        ajuda: '0 = não indicaria · 10 = indicaria certamente',
        tipo: 'NPS',
        config: { min: 0, max: 10 },
        obrigatoria: false,
      },
    ],
  },

  {
    titulo: 'Seção 2 — Avalie o Insted',
    targetType: 'INSTITUICAO',
    questoes: [
      qualidade('O nível de reconhecimento do Insted pela comunidade acadêmica é...'),
      qualidade('O nível de reconhecimento do Insted pela comunidade externa é...'),
      qualidade(
        'As condições ambientais da minha sala de trabalho (mobiliário, ventilação, iluminação, etc.) são...',
      ),
      qualidade('O nível de segurança das instalações da Instituição é...'),
      qualidade('O nível de segurança no entorno da Instituição é...'),
      qualidade('A qualidade dos serviços de apoio ao colaborador oferecidos pela Instituição é...'),
      qualidade('A qualidade da atuação da Reitoria e das Pró-Reitorias da Instituição é...'),
      qualidade('O apoio oferecido pela Instituição para meu aperfeiçoamento e estudos é...'),
      qualidade('A qualidade da limpeza e conservação das instalações físicas da Instituição é...'),
      qualidade(
        'A sistemática de comunicação e troca de informações da Instituição com os colaboradores é...',
      ),
      qualidade(
        'A qualidade e frequência dos eventos e iniciativas de Responsabilidade Social promovidos pela Instituição são...',
      ),
      aberta('Deseja fazer algum comentário sobre a Instituição?'),
    ],
  },

  {
    titulo: 'Seção 3 — Avaliação da Gestão da Instituição',
    targetType: 'INSTITUICAO',
    questoes: [
      qualidade(
        'Tenho clareza sobre o que a instituição, meu gestor imediato e minha função esperam do meu trabalho.',
      ),
      qualidade('Compreendo as expectativas da instituição quanto ao futuro do Insted.'),
      qualidade(
        'Tenho os materiais, recursos e o apoio institucional necessários para desempenhar bem minhas funções.',
      ),
      qualidade(
        'Minha chefia imediata demonstra preocupação com meu bem-estar e eu me sinto ouvido(a) e considerado(a) por ela.',
      ),
      qualidade('Há alguém na instituição que apoia e incentiva meu desenvolvimento profissional.'),
      qualidade(
        'Sinto-me ouvido(a) pelos meus colegas de trabalho e percebo comprometimento deles com a qualidade do trabalho em equipe.',
      ),
      qualidade('A instituição me faz sentir que meu trabalho é valorizado e importante.'),
      qualidade(
        'No último ano, tive oportunidades de aprendizado e crescimento dentro da instituição.',
      ),
      aberta(
        'Deseja fazer algum comentário sobre a Gestão?',
        'Aqui é o lugar para descrever algo bom ou ruim e justificar suas respostas, se desejar.',
      ),
      {
        enunciado: 'Satisfação geral. De forma geral, como você avalia sua satisfação no trabalho?',
        tipo: 'LIKERT',
        config: { ...SATISFACAO },
      },
    ],
  },

  {
    titulo: 'Seção 4 — Avaliação dos Setores e seus Respectivos Gestores',
    descricao:
      'Contato e grau de resolução de problemas. Marque "Não se aplica" onde você não utiliza o setor ou não sabe opinar: essa resposta não entra na média.',
    targetType: 'INSTITUICAO',
    questoes: [
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor Financeiro?'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor Comercial?'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor de TI?'),
      setor(
        'Como você avalia seu contato e grau de resolução de problemas com o setor da Secretaria Acadêmica?',
      ),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor Pedagógico?'),
      setor(
        'Como você avalia seu contato e grau de resolução de problemas com o setor de Organização Estrutural e Limpeza?',
      ),
      setor(
        'Como você avalia seu contato e grau de resolução de problemas com o setor da Pós-Graduação?',
      ),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor de Marketing?'),
      setor(
        'Como você avalia seu contato e grau de resolução de problemas com o setor de RH (Recursos Humanos)?',
      ),
      setor('Como você avalia seu contato e grau de resolução de problemas com a Ouvidoria?'),
      setor('Como você avalia seu contato e grau de resolução de problemas com a Portaria?'),
      aberta(
        'Deseja fazer algum comentário sobre os Setores e seus gestores?',
        'Caso queira explicar sua nota... pode ser um elogio ou reclamação.',
      ),
    ],
  },

  {
    titulo: 'CPA (Comissão Própria de Avaliação)',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Você sabe qual a importância da CPA (Comissão Própria de Avaliação)?', [
        'Sim, e sei explicar para meus colegas',
        'Sei um pouco, e não saberia explicar',
        'Não sei do que se trata e quero mais informações',
        'Outro',
      ]),
    ],
  },
];

const NOME = 'Avaliação Institucional — Técnico-Administrativo (instrumento 2026.2)';

const DESCRICAO =
  'Autoavaliação do Corpo Técnico Administrativo, Avaliação da Instituição e da Gestão Acadêmico-Administrativa — Centro Universitário Insted. Versão final da CPA. Escala de qualidade de quatro pontos (Muito insuficiente a Excelente); nos itens de setores a categoria "Não se aplica" fica fora da média. Acesso pelo link de e-mail dos técnico-administrativos, sem senha.';

const ABERTURA =
  'Queridos(as) Parceiros(as) de trabalho do Insted, obrigado por participar da nossa Avaliação Institucional. Sua participação é muito importante para nós e sua opinião faz a diferença para o crescimento e a melhoria contínua do Insted. O questionário é anônimo. — Comissão Própria de Avaliação (CPA)';

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
      publico: 'TECNICO_ADMIN',
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
  log('    · Pergunta 5, 4ª alternativa: o documento diz "Sinto-me preparado, preciso de');
  log('      treinamento". Entrou como "Não me sinto preparado, preciso de treinamento"');
  log('      (parece faltar o "Não").');
  log('    · Seção 4: o documento diz "com o Ouvidoria" e "com o Portaria". Entrou "com a".');
  log('    · Seção 3: o texto de abertura do documento manda usar concordância (Discordo a');
  log('      Concordo) nas afirmações institucionais, mas a CPA pediu "Muito insuficiente a');
  log('      Excelente" em todos os blocos. Entrou a escala de qualidade; frases como "Tenho');
  log('      clareza sobre o que a instituição espera..." respondidas com "Muito');
  log('      insuficiente" soam estranhas — a CPA decide.');
  log('    · A grade de frequência (Estudantes, Professores, Colaboradores, Outros) virou 4');
  log('      perguntas, uma por linha: o sistema não tem grade.');
  log('    · O NPS (0 a 10, opcional) tem bloco próprio logo depois da Seção 1, onde está no');
  log('      documento: dentro do bloco de auto-avaliação ele entraria nas médias dela.');
  log('    · Saíram estado civil, cor ou raça e os itens dos diretores (não estão no');
  log('      documento novo).');
  log('    · Grupo pequeno e perfil detalhado (gênero, geração, escolaridade) podem');
  log('      identificar alguém. O sistema não liga a resposta a quem a enviou, mas evite');
  log('      cruzar o perfil em relatório de setor pequeno.');
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
