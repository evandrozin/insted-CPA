/**
 * Instrumentos da avaliação 2026.2, lidos dos PDFs do Drive da CPA.
 *
 *   npm run db:formularios-2026
 *   npm run homolog -- formularios-2026
 *
 * Seis PDFs viraram cinco formulários. Os dois questionários de discente —
 * presencial e EAD — são UM formulário só, porque a diferença entre eles é de
 * modalidade, não de instrumento: `targetFiltro` decide o que cada aluno vê.
 * Era isso que, em 2025, obrigava a CPA a manter dois formulários paralelos no
 * Google Forms e a conferir na mão quem recebia qual.
 *
 * O bloco por professor é o único repetível: ele gera um card por oferta que o
 * aluno cursa no ano, com o nome do docente e da disciplina. Há duas versões,
 * mutuamente exclusivas por modalidade — cada disciplina cai em exatamente uma.
 *
 * Tudo entra como RASCUNHO. A CPA revisa e publica pelo painel; nada aqui
 * chega ao aluno sem alguém aprovar.
 */
import { PrismaClient, type QuestionType, type TargetType } from '@prisma/client';
import { createRequire } from 'node:module';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);
const require = createRequire(import.meta.url);

/** Blocos extraídos dos PDFs pelo parser (docente, técnico, pós, egressos). */
const EXTRAIDOS: Record<string, BlocoExtraido[]> = require('./questionarios-2026.json');

type QuestaoExtraida = {
  enunciado: string;
  tipo: QuestionType;
  config: Record<string, unknown> | null;
  opcoes: string[];
  obrigatoria: boolean;
};
type BlocoExtraido = { titulo: string; questoes: QuestaoExtraida[] };

// ─────────────────────────────────────────────────────────── escalas

/** Excelente…Ruim, como no questionário do discente. Sempre crescente. */
const QUALIDADE = {
  min: 1,
  max: 5,
  labels: { 1: 'Ruim', 2: 'Regular', 3: 'Bom', 4: 'Muito bom', 5: 'Excelente' },
};

/** A régua 1–5 usada no bloco por professor e na autoavaliação docente. */
const SATISFACAO = {
  min: 1,
  max: 5,
  labels: {
    1: 'Muito insatisfatório',
    2: 'Insatisfatório',
    3: 'Adequado',
    4: 'Satisfatório',
    5: 'Muito satisfatório',
  },
};

type Q = {
  enunciado: string;
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

const likert = (enunciado: string, escala = QUALIDADE, naoSeAplica = false): Q => ({
  enunciado,
  tipo: 'LIKERT',
  config: { ...escala, permiteNaoSeAplica: naoSeAplica },
});

const aberta = (enunciado: string): Q => ({
  enunciado,
  tipo: 'TEXTO_LIVRE',
  config: { maxLength: 500 },
  obrigatoria: false,
  // Comentário não entra na média: peso 0 marca questão informativa.
  peso: 0,
});

const PRESENCIAIS = ['PRESENCIAL', 'SEMIPRESENCIAL'];

// ══════════════════════════════════════════════ DISCENTES (presencial + EAD)

/**
 * Os onze itens que o aluno responde sobre CADA professor.
 *
 * Vieram do bloco repetido no PDF do presencial, onde a CPA os repetia
 * manualmente para cada docente da turma — no formulário de Odontologia, doze
 * vezes. Aqui é um bloco só.
 */
const PROFESSOR_PRESENCIAL: Q[] = [
  'A apresentação da disciplina, incluindo Plano de Ensino, propostas e ações, feitas pelo docente no início do semestre?',
  'A clareza do(a) docente no compartilhamento do conhecimento?',
  'A organização e a dinâmica das aulas conduzidas pelo(a) docente?',
  'A utilização de metodologias ativas, como a postagem antecipada de materiais no AVA?',
  'O relacionamento entre professor(a) e aluno(a), no que se refere ao favorecimento do aprendizado?',
  'O ambiente da sala de aula, no que se refere à promoção do debate de ideias e à interação entre os alunos?',
  'A promoção da reflexão sobre os conteúdos e sua relevância para as demandas da sociedade?',
  'A atuação do(a) docente diante de comportamentos inadequados em sala de aula?',
  'O compromisso do(a) docente com o aprendizado real dos alunos?',
  'O respeito do(a) docente ao horário de início e término das aulas?',
  'A conexão entre os conteúdos ensinados e o que é cobrado nas avaliações da disciplina?',
].map((e) => likert(e, SATISFACAO));

/**
 * A versão a distância dos mesmos onze itens.
 *
 * ATENÇÃO — isto é ADAPTAÇÃO, não transcrição. O Drive não trazia bloco por
 * professor para EAD: o questionário a distância avaliava o corpo docente só
 * em bloco, sem separar por disciplina. Quatro itens não fazem sentido a
 * distância e foram substituídos pelo equivalente no ambiente virtual —
 * ambiente de sala de aula, comportamento inadequado em sala, horário de
 * início e término, e a postagem antecipada de materiais.
 *
 * A CPA precisa revisar este bloco antes de publicar. Ele está marcado na
 * descrição para que ninguém o publique achando que veio pronto do Drive.
 */
const PROFESSOR_EAD: Q[] = [
  'A apresentação da disciplina no ambiente virtual, incluindo Plano de Ensino, propostas e ações, feitas pelo docente no início do semestre?',
  'A clareza do(a) docente no compartilhamento do conhecimento, nos materiais e videoaulas?',
  'A organização do material e a dinâmica das atividades propostas no AVA?',
  'A adequação dos recursos disponibilizados para o estudo autônomo (materiais, exercícios, leituras)?',
  'O relacionamento entre professor(a) e aluno(a), no que se refere ao favorecimento do aprendizado a distância?',
  'A mediação do(a) docente nos fóruns e demais espaços de interação entre os alunos?',
  'A promoção da reflexão sobre os conteúdos e sua relevância para as demandas da sociedade?',
  'O tempo de resposta do(a) docente às dúvidas encaminhadas pelo ambiente virtual?',
  'O compromisso do(a) docente com o aprendizado real dos alunos?',
  'O cumprimento, pelo(a) docente, dos prazos de postagem de materiais e de devolutivas das atividades?',
  'A conexão entre os conteúdos ensinados e o que é cobrado nas avaliações da disciplina?',
].map((e) => likert(e, SATISFACAO));

/** Os cinco itens de corpo docente em geral — idênticos nos dois PDFs. */
const CORPO_DOCENTE_GERAL: Q[] = [
  'Como você avalia o domínio do conteúdo demonstrado pelos professores nas disciplinas?',
  'Como você avalia a didática utilizada pelos professores para facilitar a compreensão dos conteúdos?',
  'Como você avalia a articulação do professor com o ambiente virtual (AVA) para a promoção das aulas?',
  'Como você avalia o comprometimento dos professores com o processo de ensino-aprendizagem?',
  'Como você avalia a qualificação e diversidade do corpo docente (formação acadêmica, experiências profissionais, atuação em diferentes áreas)?',
].map((e) => likert(e));

const DISCENTES: Bloco[] = [
  {
    titulo: 'Infraestrutura',
    descricao: 'Para quem cursa disciplinas presenciais ou semipresenciais.',
    targetType: 'INFRAESTRUTURA',
    targetFiltro: { modalidades: PRESENCIAIS },
    questoes: [
      likert(
        'Como você avalia a infraestrutura das salas de aula (iluminação, ventilação, cadeiras, quadros, projetores, etc.)?',
      ),
      likert(
        'Como você avalia o acesso à biblioteca (física e/ou digital), em termos de acervo, espaço e recursos disponíveis?',
      ),
      likert(
        'Como você avalia a estrutura e os equipamentos dos laboratórios utilizados em seu curso (se aplicável)?',
        QUALIDADE,
        true,
      ),
      likert(
        'Como você avalia os espaços de convivência (cantina, banheiros, conectividade, etc.) da faculdade?',
      ),
      likert(
        'Considerando o ambiente geral da instituição (limpeza, sinalização, acessibilidade, segurança, manutenção), como você o avalia?',
      ),
    ],
  },
  {
    titulo: 'Infraestrutura e ambiente virtual',
    descricao: 'Para quem cursa disciplinas a distância.',
    targetType: 'INFRAESTRUTURA',
    targetFiltro: { modalidades: ['EAD'] },
    questoes: [
      likert(
        'Como você avalia a infraestrutura das salas de aula (iluminação, ventilação, cadeiras, quadros, projetores, etc.)?',
        QUALIDADE,
        true,
      ),
      likert(
        'Como você avalia o acesso à biblioteca (física e/ou digital), em termos de acervo, espaço e recursos disponíveis?',
      ),
      likert('Como você avalia a estruturação e a usabilidade do Ambiente Virtual de Aprendizagem (AVA)?', QUALIDADE, true),
    ],
  },
  {
    titulo: 'Tutoria',
    descricao: 'Para quem cursa disciplinas a distância.',
    targetType: 'INSTITUICAO',
    targetFiltro: { modalidades: ['EAD'] },
    questoes: [
      // A escala da tutoria é a única que troca "Regular" por "Péssimo" no PDF.
      // Mantida como está: mudar a régua mudaria o que a série histórica mede.
      likert(
        'Como você avalia a atuação dos tutores com relação a: tempo de resposta às solicitações; qualidade das respostas; resolução dos problemas apresentados?',
        {
          min: 1,
          max: 5,
          labels: { 1: 'Péssimo', 2: 'Ruim', 3: 'Bom', 4: 'Muito bom', 5: 'Excelente' },
        },
      ),
      aberta('Deseja fazer algum comentário sobre seu curso ou sobre a tutoria a distância?'),
    ],
  },
  {
    titulo: 'Corpo docente',
    descricao: 'Percepção geral sobre o conjunto dos professores, antes da avaliação individual.',
    targetType: 'INSTITUICAO',
    questoes: CORPO_DOCENTE_GERAL,
  },
  {
    titulo: 'Professor — disciplina presencial',
    descricao:
      'Repetido uma vez por disciplina presencial que o aluno cursa no ano. Escala 1 a 5, de muito insatisfatório a muito satisfatório.',
    targetType: 'PROFESSOR_DISCIPLINA',
    repetivel: true,
    targetFiltro: { modalidades: PRESENCIAIS },
    obrigatorio: false,
    questoes: [
      ...PROFESSOR_PRESENCIAL,
      aberta('Deseja fazer algum comentário sobre o(a) professor(a)?'),
    ],
  },
  {
    titulo: 'Professor — disciplina a distância',
    descricao:
      'ADAPTADO PELA EQUIPE — o Drive não trazia bloco por professor para EAD. Quatro itens presenciais foram substituídos pelo equivalente no ambiente virtual. Revisar antes de publicar.',
    targetType: 'PROFESSOR_DISCIPLINA',
    repetivel: true,
    targetFiltro: { modalidades: ['EAD'] },
    obrigatorio: false,
    questoes: [...PROFESSOR_EAD, aberta('Deseja fazer algum comentário sobre o(a) professor(a)?')],
  },
  {
    titulo: 'Comentário final',
    targetType: 'INSTITUICAO',
    obrigatorio: false,
    questoes: [
      aberta(
        'Deixe aqui alguma sugestão, consideração ou elogio sobre a infraestrutura, o corpo docente ou qualquer outra área da faculdade. Por favor, não se identifique.',
      ),
    ],
  },
];

// ══════════════════════════════════════════════════════ formulários

type Formulario = {
  nome: string;
  publico: 'ALUNO' | 'PROFESSOR' | 'TECNICO_ADMIN';
  descricao: string;
  blocos: Bloco[];
};

/** Converte um bloco extraído do PDF em bloco do formulário. */
function doPdf(
  arquivo: string,
  targetType: TargetType = 'INSTITUICAO',
): Bloco[] {
  const blocos = EXTRAIDOS[arquivo];
  if (!blocos) throw new Error(`Bloco extraído não encontrado: ${arquivo}`);

  return blocos.map((b) => ({
    titulo: b.titulo,
    targetType,
    questoes: b.questoes.map((q) => ({
      enunciado: q.enunciado,
      tipo: q.tipo,
      config: q.config,
      obrigatoria: q.obrigatoria,
      opcoes: q.opcoes,
      peso: q.tipo === 'TEXTO_LIVRE' || q.tipo === 'ESCOLHA_UNICA' ? 0 : 1,
    })),
  }));
}

const FORMULARIOS: Formulario[] = [
  {
    nome: '2026 Avaliação Institucional — Discentes',
    publico: 'ALUNO',
    descricao:
      'Infraestrutura, corpo docente e avaliação individual por professor. Presencial e EAD no mesmo instrumento: a modalidade da disciplina decide quais blocos o aluno recebe.',
    blocos: DISCENTES,
  },
  {
    nome: '2026 Avaliação Institucional — Docentes',
    publico: 'PROFESSOR',
    descricao:
      'Autoavaliação docente e avaliação da instituição, da coordenação, dos setores e dos discentes.',
    blocos: doPdf('questionario_docente__', 'AUTOAVALIACAO'),
  },
  {
    nome: '2026 Avaliação Institucional — Técnico-Administrativo',
    publico: 'TECNICO_ADMIN',
    descricao: 'Autoavaliação, clima organizacional e avaliação dos setores e gestores.',
    blocos: doPdf('questionario_tecnico_administrativo'),
  },
  {
    nome: '2026 Avaliação Institucional — Pós-Graduação',
    publico: 'ALUNO',
    descricao:
      'Curso, infraestrutura, corpo docente e coordenação, na percepção do pós-graduando.',
    blocos: doPdf('questionario_pos_graduacao'),
  },
  {
    nome: '2026 Programa de Acompanhamento de Egressos',
    publico: 'ALUNO',
    descricao:
      'Formação recebida e inserção no mercado. ATENÇÃO: egresso não é um público que o sistema saiba alcançar — não tem matrícula ativa e não entra na geração de tarefas. Fica cadastrado para a CPA revisar; aplicá-lo exige decidir como convidar quem já saiu.',
    blocos: doPdf('questionario_egressos'),
  },
];

// ══════════════════════════════════════════════════════════ gravação

async function main(): Promise<void> {
  log('\nInstrumentos da avaliação 2026.2\n');

  for (const f of FORMULARIOS) {
    const existente = await prisma.formTemplate.findFirst({
      where: { nome: f.nome, versao: 1 },
      select: { id: true, status: true },
    });

    if (existente) {
      if (existente.status !== 'RASCUNHO') {
        log(`⏭  ${f.nome}\n    já publicado — não sobrescrevo instrumento em uso.\n`);
        continue;
      }
      // Rascunho é substituído por inteiro: blocos e questões caem em cascata.
      await prisma.formTemplate.delete({ where: { id: existente.id } });
    }

    const form = await prisma.formTemplate.create({
      data: {
        nome: f.nome,
        descricao: f.descricao,
        publico: f.publico,
        versao: 1,
        status: 'RASCUNHO',
      },
    });

    let ordemBloco = 0;
    let totalQuestoes = 0;

    for (const b of f.blocos) {
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
        }
        totalQuestoes++;
      }
    }

    log(`✅ ${f.nome}`);
    log(`    ${f.blocos.length} blocos · ${totalQuestoes} questões · ${f.publico}\n`);
  }

  const repetiveis = await prisma.questionBlock.count({
    where: { repetivel: true, form: { nome: { startsWith: '2026' } } },
  });

  log('─────────────────────────────────────────────────');
  log(`  ${repetiveis} blocos repetíveis — um card por professor do aluno.`);
  log('  Todos entram como RASCUNHO: revise e publique pelo painel.');
  log('');
  log('  Revisar antes de publicar:');
  log('   · "Professor — disciplina a distância" foi ADAPTADO, não transcrito.');
  log('   · O questionário de egressos não tem como ser distribuído hoje.');
  log('─────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
