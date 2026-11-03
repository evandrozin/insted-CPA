/**
 * Avaliação Institucional — Técnico-Administrativo (instrumento 2026.2).
 *
 *   npm run db:formulario-tecnico
 *   npm run homolog -- formulario-tecnico
 *
 * Transcrito do questionário da CPA (questionario_tecnico_administrativo.pdf,
 * exportado do Google Forms): auto-avaliação do colaborador, avaliação da
 * instituição, da gestão e dos setores.
 *
 * Existe porque a versão que entrou por conversão automática do PDF
 * (`formularios-2026.ts`) saiu quebrada: perguntas do perfil repetidas dentro da
 * auto-avaliação, a grade de frequência partida em pedaços soltos, os 13 itens
 * de setores viraram "escolha única" com uma alternativa só e o NPS aparece
 * duas vezes. Este é o instrumento certo; o anterior não é apagado — fica onde
 * está, e o ciclo passa a usar este.
 *
 * Escala de cinco pontos de adequação (Muito insuficiente … Excelente), igual
 * à do PDF. Nos itens de setores entra a categoria "Não se aplica", que o PDF
 * marca como 0 e que aqui fica FORA da média, em vez de valer zero.
 *
 * Entra como RASCUNHO. Ninguém responde nada até a CPA publicar pelo painel.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

const ADEQUACAO = {
  min: 1,
  max: 5,
  labels: { 1: 'Muito insuficiente', 2: 'Insuficiente', 3: 'Adequado', 4: 'Bom', 5: 'Excelente' },
};

const FREQUENCIA = {
  min: 1,
  max: 4,
  labels: { 1: 'Nenhuma', 2: 'Pouca', 3: 'Regularmente', 4: 'Muita' },
};

/** O PDF só nomeia os extremos: 1 completamente insatisfeito, 5 completamente satisfeito. */
const SATISFACAO = {
  min: 1,
  max: 5,
  labels: { 1: 'Completamente insatisfeito', 5: 'Completamente satisfeito' },
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

const adequacao = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...ADEQUACAO },
});

/** Item de setor/gestor: "Não se aplica" fica fora da média. */
const setor = (enunciado: string): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: {
    ...ADEQUACAO,
    permiteNaoSeAplica: true,
    rotuloNaoSeAplica: 'Não se aplica (não utilizo ou não sei opinar)',
  },
});

const escolha = (enunciado: string, opcoes: string[], extra: Partial<Q> = {}): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  opcoes,
  peso: 0,
  ...extra,
});

const aberta = (enunciado: string): Q => ({
  enunciado,
  tipo: 'TEXTO_LIVRE',
  config: { maxLength: 500 },
  obrigatoria: false,
  peso: 0,
});

const contato = (publico: string): Q => ({
  enunciado: `Com que frequência você atende ou tem contato com: ${publico}`,
  tipo: 'LIKERT',
  config: { ...FREQUENCIA },
  peso: 0,
});

const BLOCOS: Bloco[] = [
  {
    titulo: 'Perfil do colaborador',
    descricao:
      'Quem responde. As respostas são anônimas: o sistema não liga a resposta a quem a enviou.',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Qual é o seu gênero?', ['Masculino', 'Feminino', 'Prefiro não informar', 'Outro']),
      escolha('Em que ano você nasceu?', [
        'Entre 1946 e 1964',
        'Entre 1965 e 1980',
        'Entre 1981 e 1996',
        'Entre 1997 e 2010',
        'A partir de 2010',
        'Outro',
      ]),
      escolha('Qual o seu estado civil?', [
        'Solteiro(a)',
        'Casado(a)',
        'Separado(a) judicialmente/divorciado(a)',
        'Viúvo(a)',
        'Outro',
      ]),
      // O PDF exportou esta pergunta SEM as alternativas. As categorias abaixo
      // são as do IBGE, para a CPA confirmar antes de publicar.
      escolha('Com relação à sua cor ou raça, como você se considera?', [
        'Branca',
        'Preta',
        'Parda',
        'Amarela',
        'Indígena',
        'Prefiro não declarar',
      ]),
      escolha('Até que etapa de escolarização você concluiu?', [
        'Nenhuma',
        'Ensino Fundamental I: 1º ao 5º ano (1ª a 4ª série)',
        'Ensino Fundamental II: 6º ao 9º ano (5ª a 8ª série)',
        'Ensino Médio incompleto',
        'Ensino Médio completo',
        'Ensino Superior - Graduação completo',
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
        'Caso atenda um ou mais públicos citados anteriormente, como você se sente com relação a esse atendimento?',
        [
          'Não atendo nenhum público citado',
          'Me sinto completamente preparado para o atendimento que realizo',
          'Me sinto preparado, mas sinto que preciso melhorar em alguns aspectos que dependem de mim mesmo',
          'Me sinto preparado, mas gostaria de mais treinamento na função específica que exerço',
          'Não me sinto preparado, preciso de treinamento',
          'Outro',
        ],
      ),
    ],
  },

  {
    titulo: 'Auto-avaliação — avalie sua atuação como colaborador',
    targetType: 'AUTOAVALIACAO',
    questoes: [
      adequacao('Meu nível de motivação para realizar meu trabalho é...'),
      adequacao('Meu nível de compreensão sobre meu papel na instituição é...'),
      adequacao('O aproveitamento do meu tempo durante o expediente é...'),
      adequacao('Meu esforço para aprender e me adaptar às tarefas do meu setor é...'),
      adequacao('A qualidade do meu relacionamento com os colegas do meu setor é...'),
      adequacao('A qualidade do meu relacionamento com colegas de outros setores da instituição é...'),
      adequacao('Minha pontualidade em relação a compromissos e atividades é...'),
      adequacao('Minhas competências e habilidades na solução de problemas no dia a dia são...'),
      adequacao(
        'Meu conhecimento sobre as atividades de outros setores e sobre as atualizações da faculdade é...',
      ),
      aberta(
        'Nos diga qual(is) treinamento(s) gostaria de participar que acredita irá melhorar seu desempenho profissional e/ou pessoal.',
      ),
      aberta('Deseja fazer algum comentário sobre sua atuação/auto-avaliação na Instituição?'),
    ],
  },

  {
    titulo: 'Instituição — avalie a Faculdade Insted',
    targetType: 'INSTITUICAO',
    questoes: [
      {
        enunciado:
          'Em uma nota de 0 a 10, quanto você indicaria a nossa faculdade a um amigo ou familiar?',
        ajuda: '0 = não indicaria · 10 = indicaria com certeza',
        tipo: 'NPS',
        config: { min: 0, max: 10 },
      },
      adequacao('O nível de reconhecimento da Faculdade Insted pela comunidade acadêmica é...'),
      adequacao('O nível de reconhecimento da Faculdade Insted pela comunidade externa é...'),
      adequacao(
        'As condições ambientais da minha sala de trabalho (mobiliário, ventilação, iluminação etc.) são...',
      ),
      adequacao('O nível de segurança das instalações da Instituição é...'),
      adequacao('O nível de segurança no entorno da Instituição é...'),
      adequacao('A qualidade dos serviços de apoio ao colaborador oferecidos pela Instituição é...'),
      adequacao('A qualidade da atuação da diretoria da Instituição é...'),
      adequacao('O apoio oferecido pela Instituição para meu aperfeiçoamento e estudos é...'),
      adequacao('A qualidade da limpeza e conservação das instalações físicas da Instituição é...'),
      adequacao(
        'A sistemática de comunicação e troca de informações da Instituição com os colaboradores é...',
      ),
      adequacao(
        'A qualidade e frequência dos eventos e iniciativas de Responsabilidade Social promovidos pela Instituição são...',
      ),
      aberta('Deseja fazer algum comentário sobre a Instituição?'),
    ],
  },

  {
    titulo: 'Gestão — avaliação da gestão da instituição',
    targetType: 'INSTITUICAO',
    questoes: [
      adequacao('Eu tenho clareza sobre o que a instituição espera do meu trabalho.'),
      adequacao('Eu compreendo as expectativas da instituição quanto ao futuro da Faculdade Insted.'),
      adequacao('Sei claramente o que meu gestor espera em termos de resultados do meu trabalho.'),
      adequacao('Os materiais e recursos que preciso para desempenhar bem minhas funções estão disponíveis.'),
      adequacao('Eu me sinto apoiado pela instituição para realizar meu melhor trabalho diariamente.'),
      adequacao('Eu tenho clareza sobre as funções que devo desempenhar.'),
      adequacao('Minha chefia imediata demonstra preocupação com meu bem-estar pessoal.'),
      adequacao('Há alguém na instituição que apoia e incentiva meu desenvolvimento profissional.'),
      adequacao('Eu me sinto ouvido e considerado pela minha chefia imediata.'),
      adequacao('Eu me sinto ouvido e considerado pelos meus colegas de trabalho.'),
      adequacao('A instituição me faz sentir que meu trabalho é valorizado e importante.'),
      adequacao('Eu percebo que meus colegas estão comprometidos com a qualidade do trabalho em equipe.'),
      adequacao('No último ano, tive oportunidades de aprendizado e crescimento dentro da instituição.'),
      aberta(
        'Deseja fazer algum comentário sobre a Gestão? Aqui é o lugar para descrever algo bom ou ruim e justificar suas respostas, se desejar.',
      ),
      {
        enunciado: 'De forma geral, como você avalia sua satisfação no trabalho?',
        ajuda: '1 = completamente insatisfeito · 5 = completamente satisfeito',
        tipo: 'LIKERT',
        config: { ...SATISFACAO },
      },
    ],
  },

  {
    titulo: 'Avaliação dos setores e seus gestores',
    descricao:
      'Contato e grau de resolução de problemas. Marque "Não se aplica" onde você não utiliza o setor ou não sabe opinar: essa resposta não entra na média.',
    targetType: 'INSTITUICAO',
    questoes: [
      setor('Como você avalia seu contato e grau de resolução de problemas com os diretores: Neca e Fernando'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o diretor: Marcelo Salomão'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor financeiro'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor comercial'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor de TI'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor da secretaria acadêmica'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor pedagógico'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor de organização estrutural e limpeza'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor da pós-graduação'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor de marketing'),
      setor('Como você avalia seu contato e grau de resolução de problemas com o setor de RH (Recursos Humanos)'),
      setor('Como você avalia seu contato e grau de resolução de problemas com a ouvidoria'),
      setor('Como você avalia seu contato e grau de resolução de problemas com a portaria'),
      aberta(
        'Deseja fazer algum comentário sobre os setores e seus gestores? Caso queira explicar sua nota, faça isso aqui — pode ser um elogio ou uma reclamação.',
      ),
    ],
  },

  {
    titulo: 'CPA — Comissão Própria de Avaliação',
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
  'Instrumento da CPA para o corpo técnico-administrativo: perfil, auto-avaliação do colaborador, avaliação da instituição, da gestão e dos setores, e conhecimento sobre a CPA. Escala de cinco pontos de adequação (Muito insuficiente a Excelente); nos itens de setores a categoria "Não se aplica" fica fora da média. Acesso pelo link de e-mail dos técnico-administrativos, sem senha.';

const ABERTURA =
  'Queridos(as) parceiros(as) de trabalho da Faculdade Insted: obrigado por participar da NOSSA Avaliação Institucional. A sua participação é muito importante e SUA OPINIÃO FAZ A DIFERENÇA para o crescimento e a melhoria contínua da Faculdade INSTED. A avaliação é ANÔNIMA. — Comissão Própria de Avaliação (CPA)';

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
  log('    · A pergunta de cor ou raça veio SEM alternativas no PDF. Entraram as do');
  log('      IBGE (branca, preta, parda, amarela, indígena, prefiro não declarar).');
  log('    · Os "Outro:" com campo de texto viraram a alternativa "Outro".');
  log('    · O NPS do PDF tem as bolinhas de 1 a 10, apesar do enunciado dizer 0 a 10.');
  log('      Aqui vai de 0 a 10, como o enunciado.');
  log('    · Os itens 17.1 e 17.2 citam diretores pelo nome, como no documento.');
  log('    · Grupo pequeno e perfil detalhado (gênero, geração, estado civil, cor,');
  log('      escolaridade) podem identificar alguém. O sistema não liga a resposta a');
  log('      quem a enviou, mas evite cruzar o perfil em relatório de setor pequeno.');
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
