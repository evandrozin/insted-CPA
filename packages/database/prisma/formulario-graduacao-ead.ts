/**
 * Avaliação Institucional Discente — Graduação Virtual/EAD.
 *
 *   npm run db:formulario-ead
 *   npm run homolog -- formulario-ead
 *
 * Transcrito do documento detalhado da CPA (Questionario_Graduacao_EAD). É o
 * par do instrumento presencial: mesma régua de quatro pontos sem ponto médio,
 * mesma estrutura de permanência e recomendação, e o mesmo módulo anual de
 * perfil — mas as perguntas são outras, porque a experiência é outra. Onde o
 * presencial pergunta sobre sala de aula, laboratório e convivência, aqui se
 * pergunta sobre o AVA, a tutoria e o equipamento com que se estuda.
 *
 * NÃO TOCA no instrumento presencial que está sendo aplicado: é um formulário
 * próprio, com nome próprio. Todos os blocos carregam o filtro de modalidade
 * EAD (ver SO_EAD), de modo que o formulário só chega a quem cursa EAD — sem
 * isso o gerador o entregaria a todos os alunos ativos.
 *
 * Este entra INTEIRO, sem simplificação, porque tudo que ele pede já existe no
 * sistema: a pergunta condicional (4A e 20A) e o bloco repetível por professor
 * filtrado por modalidade EAD.
 *
 * Três coisas do documento ficaram registradas como vieram, para a CPA decidir:
 *
 * 1. A pergunta 2 pede "carregar dinamicamente as turmas válidas para o curso".
 *    Alternativa dinâmica não existe no modelo — entra como texto curto, igual
 *    ao presencial.
 * 2. A numeração tem tropeços: o NPS de recomendação é numerado 20, repetindo o
 *    de permanência; dentro da grade do professor há um "20.5" onde deveria ser
 *    22.5; e a seção 4 anuncia "questões 10 a 14" e lista 13 a 18.
 * 3. Na 19 está escrito "tutria". Corrigido para "tutoria" — é erro de
 *    digitação, não termo da CPA.
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

/** A régua da grade do professor: frequência, não concordância. */
const FREQUENCIA = {
  min: 1,
  max: 4,
  labels: { 1: 'Nunca', 2: 'Raramente', 3: 'Frequentemente', 4: 'Sempre' },
};

type Condicao = {
  /** Chave local da pergunta que controla — resolvida para id na gravação. */
  de: string;
  operador: 'entre' | 'eq' | 'ne' | 'lte' | 'gte';
  valor: number | number[];
};

type Q = {
  enunciado: string;
  ajuda?: string;
  tipo?: QuestionType;
  config?: Record<string, unknown> | null;
  obrigatoria?: boolean;
  peso?: number;
  opcoes?: string[];
  /** Nome local, para outra pergunta poder depender desta. */
  chave?: string;
  condicao?: Condicao;
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

const linear = (enunciado: string, ajuda: string): Q => ({
  enunciado,
  ajuda,
  tipo: 'NPS',
  config: { min: 0, max: 10 },
});

const aberta = (enunciado: string, maxLength = 500): Q => ({
  enunciado,
  tipo: 'TEXTO_LIVRE',
  config: { maxLength },
  obrigatoria: false,
  peso: 0,
});

const escolha = (enunciado: string, opcoes: string[], extra: Partial<Q> = {}): Q => ({
  enunciado,
  tipo: 'ESCOLHA_UNICA',
  opcoes,
  peso: 0,
  ...extra,
});

/**
 * Filtro de modalidade aplicado a TODOS os blocos.
 *
 * O gerador entrega cada formulário de aluno a todos os alunos ativos do
 * semestre — não existe restrição por curso no nível do formulário. Sem este
 * filtro, o aluno presencial receberia "Experiência digital" e "Tutoria", e o
 * resultado do EAD seria diluído por gente que não cursa EAD.
 *
 * Bloco fixo com filtro de modalidade só aparece para quem tem ao menos uma
 * disciplina nessa modalidade, e aluno que fica sem nenhum bloco não recebe
 * tarefa. Com o filtro em todos, o formulário se auto-seleciona: chega a quem
 * cursa EAD — inclusive o aluno misto, que tem as duas — e a mais ninguém.
 *
 * Limite conhecido: oferta com modalidade NÃO INFORMADA nunca casa. Aluno cujas
 * disciplinas estão todas sem modalidade fica de fora até a modalidade ser
 * corrigida nas alocações.
 */
const SO_EAD = { modalidades: ['EAD'] };

const BLOCOS: Bloco[] = [
  {
    titulo: 'Caracterização acadêmica',
    descricao:
      'Curso e turma. O sistema já conhece os dois pela matrícula; são perguntados por decisão da CPA e não entram em nenhuma média.',
    targetType: 'INSTITUICAO',
    questoes: [
      escolha('Qual é o seu curso?', [
        'Administração',
        'Gestão Comercial',
        'Gestão de Recursos Humanos',
        'Gestão Pública',
        'Pedagogia',
        'Outro curso vigente',
      ]),
      {
        enunciado: 'Qual é a sua turma/semestre?',
        ajuda:
          'Escreva o semestre — por exemplo, "3º semestre". A lista automática por curso ainda não existe no sistema.',
        tipo: 'TEXTO_LIVRE',
        config: { maxLength: 60 },
        peso: 0,
      },
    ],
  },

  {
    titulo: 'Experiência digital',
    descricao: 'Ambiente virtual, materiais e comunicação do curso.',
    targetType: 'INFRAESTRUTURA',
    questoes: [
      acordo(
        'Consigo localizar com facilidade no AVA os conteúdos, atividades, prazos e informações de que preciso.',
      ),
      {
        ...acordo(
          'O AVA apresenta estabilidade e funcionamento adequados para acompanhar o curso.',
        ),
        chave: 'ava-estabilidade',
      },
      {
        ...escolha('Qual problema você encontra com maior frequência no AVA?', [
          'Instabilidade ou indisponibilidade',
          'Lentidão',
          'Dificuldade de login/acesso',
          'Dificuldade para localizar conteúdos',
          'Problemas para enviar atividades',
          'Problemas no celular',
          'Problemas com vídeo/aulas',
          'Outro',
        ]),
        ajuda: 'Aparece para quem discordou da afirmação anterior.',
        obrigatoria: false,
        // "Se resposta 1 ou 2" — quem discordou, total ou parcialmente.
        condicao: { de: 'ava-estabilidade', operador: 'lte', valor: 2 },
      },
      acordo(
        'Os recursos da biblioteca digital atendem às minhas necessidades acadêmicas.',
        'Não utilizei a biblioteca digital neste semestre.',
      ),
      acordo(
        'Os materiais e conteúdos das disciplinas são disponibilizados de maneira organizada e em tempo adequado.',
      ),
      acordo(
        'As informações sobre atividades, avaliações, prazos e acontecimentos do curso são comunicadas com clareza.',
      ),
    ],
  },

  {
    titulo: 'Tutoria e atendimento',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo(
        'Quando procuro a tutoria, recebo resposta em tempo adequado.',
        'Não tive contato com tutoria neste semestre.',
      ),
      acordo(
        'As orientações recebidas pela tutoria são claras e úteis.',
        'Não tive contato com tutoria neste semestre.',
      ),
      acordo(
        'A tutoria consegue resolver minha necessidade ou encaminhá-la adequadamente para quem pode resolvê-la.',
        'Não tive contato com tutoria neste semestre.',
      ),
      aberta('Deseja registrar alguma observação sobre a tutoria?'),
      acordo(
        'Quando tenho uma dúvida ou problema acadêmico, sei qual canal do Insted devo procurar.',
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
    titulo: 'Aprendizagem e experiência com o curso',
    targetType: 'INSTITUICAO',
    questoes: [
      acordo(
        'As explicações, materiais e atividades das disciplinas favorecem minha compreensão dos conteúdos.',
      ),
      acordo(
        'O curso relaciona o que aprendo com situações profissionais, problemas reais ou demandas da sociedade.',
      ),
      acordo('Já participei de atividades de pesquisa e/ou extensão oferecidas pelo curso.'),
      acordo(
        'Consigo organizar minha rotina para acompanhar adequadamente as atividades do curso.',
      ),
      acordo(
        'Mesmo estudando de forma virtual, sinto que faço parte da comunidade acadêmica do Insted.',
      ),
      acordo(
        'Considerando minha experiência até aqui, o curso tem entregado valor compatível com o investimento necessário para realizá-lo.',
      ),
      aberta(
        'Deseja registrar algum outro comentário sobre a infraestrutura, o atendimento, a coordenação de curso, a tutoria ou qualquer outro aspecto da sua experiência acadêmica no Insted?',
      ),
    ],
  },

  {
    titulo: 'Permanência e recomendação',
    targetType: 'INSTITUICAO',
    questoes: [
      {
        ...linear(
          'De 0 a 10, qual é a probabilidade de você continuar estudando no Insted no próximo semestre?',
          '0 = nenhuma probabilidade · 10 = certamente continuarei',
        ),
        chave: 'permanencia',
      },
      {
        ...escolha('Qual fator mais pode dificultar sua permanência no Insted?', [
          'Questão financeira',
          'Trabalho ou falta de tempo',
          'Dificuldade para organizar a rotina de estudos',
          'Dificuldade acadêmica',
          'Dificuldade de utilização do ambiente virtual',
          'Falta de interação ou acompanhamento',
          'Dúvidas sobre o curso escolhido',
          'Atendimento institucional',
          'Pretendo estudar em outra instituição',
          'Motivo pessoal ou familiar',
          'Problemas de acesso à internet/equipamentos',
          'Outro',
        ]),
        ajuda: 'Aparece para quem respondeu de 0 a 6 acima. Indique apenas o fator principal.',
        obrigatoria: false,
        condicao: { de: 'permanencia', operador: 'entre', valor: [0, 6] },
      },
      linear(
        'De 0 a 10, qual é a probabilidade de você recomendar a graduação virtual do Insted a alguém que esteja procurando uma faculdade?',
        '0 = nenhuma probabilidade · 10 = certamente recomendaria',
      ),
      aberta(
        'Se o Insted pudesse melhorar apenas uma coisa na sua experiência na graduação virtual no próximo semestre, o que deveria ser?',
      ),
    ],
  },

  {
    titulo: 'Disciplina e professor',
    descricao:
      'Repetido uma vez por disciplina a distância que você cursa, com o nome do professor e da disciplina. Responda apenas onde houve contato suficiente para avaliar.',
    targetType: 'PROFESSOR_DISCIPLINA',
    repetivel: true,
    // Só as ofertas EAD: o aluno que cursa disciplinas nas duas modalidades não
    // recebe aqui as presenciais — elas têm instrumento próprio.
    targetFiltro: { modalidades: ['EAD'] },
    obrigatorio: false,
    questoes: [
      frequencia(
        'Os conteúdos e atividades são apresentados de forma organizada e com orientações claras.',
      ),
      frequencia('As explicações e materiais facilitam minha compreensão dos conteúdos.'),
      frequencia(
        'Os recursos digitais utilizados (vídeos, textos, atividades ou outros materiais) contribuem para minha aprendizagem.',
      ),
      frequencia(
        'As atividades ajudam a relacionar o conteúdo com situações profissionais ou aplicações práticas.',
      ),
      frequencia(
        'Recebo orientações ou feedbacks que ajudam a perceber como melhorar minha aprendizagem.',
      ),
      frequencia(
        'As avaliações são coerentes com os conteúdos e objetivos trabalhados na disciplina.',
      ),
      linear(
        'De 0 a 10, quanto esta disciplina contribuiu para sua aprendizagem neste semestre?',
        '0 = não contribuiu · 10 = contribuiu de forma excepcional',
      ),
      aberta('Deseja registrar alguma observação sobre esta disciplina?', 300),
    ],
  },

  {
    titulo: 'Perfil e condições de permanência — módulo anual',
    descricao:
      'MÓDULO ANUAL, não semestral: o documento recomenda aplicá-lo uma vez por ano para não cansar o formulário principal. A CPA remove este bloco nos ciclos em que não for usá-lo.',
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
      escolha(
        'Qual equipamento você utiliza principalmente para acompanhar a graduação virtual?',
        [
          'Computador/notebook próprio',
          'Computador compartilhado',
          'Celular',
          'Tablet',
          'Equipamento do trabalho',
          'Outro',
        ],
      ),
      escolha('Você possui acesso estável à internet para realizar as atividades do curso?', [
        'Sempre',
        'Na maior parte do tempo',
        'Às vezes',
        'Raramente',
        'Não',
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

const NOME = '2026 Avaliação Institucional — Graduação EAD';

const DESCRICAO =
  'Instrumento da CPA para a graduação virtual: escala de concordância de quatro pontos, sem ponto médio, com categoria separada para "não utilizei". Duas perguntas aparecem conforme a resposta anterior — o problema no AVA, para quem discordou da estabilidade, e o fator de risco de evasão, para quem respondeu de 0 a 6 na permanência. O bloco por disciplina repete apenas nas ofertas EAD. Não substitui nem altera o instrumento presencial.';

const ABERTURA =
  'Sua experiência ajuda o Insted a identificar o que funciona bem e o que deve ser melhorado na graduação virtual. O questionário é anônimo e leva aproximadamente 3 a 4 minutos para ser respondido. Algumas questões aparecerão somente de acordo com suas respostas. Responda considerando sua experiência neste semestre.';

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

  // As condicionais só podem ser gravadas depois que a pergunta que controla
  // existe e tem id. Primeira passagem cria tudo e anota as chaves; segunda
  // resolve as dependências.
  const idPorChave = new Map<string, string>();
  const pendentes: { questionId: string; condicao: Condicao }[] = [];

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
        targetFiltro: b.targetFiltro ?? SO_EAD,
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

      if (q.chave) idPorChave.set(q.chave, questao.id);
      if (q.condicao) pendentes.push({ questionId: questao.id, condicao: q.condicao });

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

  for (const { questionId, condicao } of pendentes) {
    const controleId = idPorChave.get(condicao.de);
    if (!controleId) throw new Error(`Condição sem pergunta de controle: ${condicao.de}`);

    await prisma.question.update({
      where: { id: questionId },
      data: {
        condicao: {
          questionId: controleId,
          operador: condicao.operador,
          valor: condicao.valor,
        },
      },
    });
  }

  log(`✅ ${BLOCOS.length} blocos · ${questoes} questões · ${alternativas} alternativas`);
  log(`   ${pendentes.length} perguntas condicionais`);
  log('');
  log('   Entrou como RASCUNHO. Revise e publique pelo painel.');
  log('');
  log('   Para a CPA conferir antes de publicar:');
  log('    · A turma é digitada pelo aluno; não há lista automática por curso.');
  log('    · O módulo anual de perfil é o último bloco: remova-o nos ciclos');
  log('      em que não for aplicá-lo.');
  log('    · Curso e turma ficam gravados junto das respostas. Em turma');
  log('      pequena, isso estreita o cerco sobre quem respondeu.');
  log('    · O documento tem tropeços de numeração (dois itens "20", um');
  log('      "20.5" no lugar de 22.5) e "tutria" na 19, corrigido aqui.');
  log('');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
