/**
 * Respostas sintéticas para desenvolver relatório, moderação e exportação.
 *
 *   npm run db:respostas-teste          cria o ciclo de teste e as respostas
 *   npm run db:respostas-teste -- limpar remove tudo
 *
 * Construir relatório sem dado é construir no escuro: a média de nada é nada,
 * a distribuição não aparece e a supressão por k-anonimato nunca dispara. Isto
 * gera um ciclo próprio, com respostas cobrindo todos os formatos de valor —
 * escala, 0 a 10, escolha única, múltipla, "não se aplica" e comentário.
 *
 * SÓ RODA EM BANCO LOCAL. Massa sintética misturada a resposta real de aluno
 * corromperia o resultado da avaliação, e não há como separar depois: a
 * resposta é anônima por construção.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const prisma = new PrismaClient();

const CICLO = 'TESTE — massa sintética para relatórios';

/** Quantas "pessoas" responder. Acima do mínimo de exibição (5) de propósito. */
const PESSOAS = 9;

function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL ?? '';
  const local = /@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url);
  if (!local) {
    throw new Error(
      'Isto só roda em banco local. A URL atual não é localhost — se fosse, massa ' +
        'sintética entraria no meio das respostas reais, sem como separar depois.',
    );
  }
}

async function limpar(): Promise<void> {
  const ciclo = await prisma.evaluationPeriod.findFirst({ where: { nome: CICLO } });
  if (!ciclo) return console.log('🧹 nada a remover');
  await prisma.evaluationPeriod.delete({ where: { id: ciclo.id } });
  console.log('🧹 ciclo de teste removido');
}

async function semear(): Promise<void> {
  await limpar();

  // Entre os formulários de aluno, o mais completo: o que tem bloco repetível
  // por professor. Sem ele não há relatório por docente nem supressão por
  // poucas respostas — justamente o que precisa ser testado.
  const candidatos = await prisma.formTemplate.findMany({
    where: { publico: 'ALUNO', status: 'RASCUNHO' },
    orderBy: { criadoEm: 'desc' },
    select: {
      id: true,
      nome: true,
      blocos: {
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          titulo: true,
          repetivel: true,
          targetType: true,
          questoes: {
            orderBy: { ordem: 'asc' },
            select: {
              id: true,
              tipo: true,
              config: true,
              opcoes: { orderBy: { ordem: 'asc' }, select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (candidatos.length === 0) {
    throw new Error('Nenhum formulário de aluno em rascunho para usar de molde.');
  }

  const form =
    candidatos.find((f) => f.blocos.some((b) => b.repetivel)) ??
    [...candidatos].sort((a, b) => b.blocos.length - a.blocos.length)[0];

  const term = await prisma.academicTerm.findFirst({ orderBy: { codigo: 'desc' } });
  if (!term) throw new Error('Nenhum semestre no banco. Importe o JACAD ou rode a demonstração.');

  // Várias turmas, de cursos diferentes: é o que faz o relatório por curso ter
  // mais de uma linha e a supressão por poucas respostas aparecer de verdade.
  const turmas = await prisma.schoolClass.findMany({
    where: { termId: term.id },
    take: 4,
    select: { id: true, courseId: true, turno: true, periodo: true },
  });
  if (turmas.length === 0) throw new Error('Nenhuma turma no semestre mais recente.');

  const ofertas = await prisma.teachingAssignment.findMany({
    where: { modalidade: { in: ['PRESENCIAL', 'SEMIPRESENCIAL'] }, ativo: true },
    take: 3,
    select: { id: true, teacherId: true, subjectId: true },
  });

  const agora = new Date();
  const ciclo = await prisma.evaluationPeriod.create({
    data: {
      nome: CICLO,
      descricao: 'Massa sintética. Pode apagar com: npm run db:respostas-teste -- limpar',
      ano: 2026,
      termId: term.id,
      status: 'ABERTO',
      abreEm: new Date(agora.getTime() - 7 * 86_400_000),
      fechaEm: new Date(agora.getTime() + 7 * 86_400_000),
      formularios: { create: { formId: form.id, publico: 'ALUNO' } },
    },
    select: { id: true, formularios: { select: { id: true } } },
  });

  const periodFormId = ciclo.formularios[0].id;
  let conjuntos = 0;
  let respostas = 0;

  for (let pessoa = 0; pessoa < PESSOAS; pessoa++) {
    const turma = turmas[pessoa % turmas.length];
    // Espalhado nos últimos dias, para o gráfico de envios por dia ter curva.
    const dias = pessoa % 5;
    const submetidoEm = new Date(
      Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate() - dias),
    );

    for (const bloco of form.blocos) {
      const alvos = bloco.repetivel && ofertas.length > 0 ? ofertas : [null];

      for (const oferta of alvos) {
        const setId = randomUUID();
        await prisma.responseSet.create({
          data: {
            id: setId,
            periodId: ciclo.id,
            periodFormId,
            blockId: bloco.id,
            targetType: bloco.targetType,
            targetRefId: oferta?.id ?? null,
            teacherId: oferta?.teacherId ?? null,
            subjectId: oferta?.subjectId ?? null,
            respondentRole: 'ALUNO',
            respondentCourseId: turma.courseId,
            respondentClassId: turma.id,
            respondentTurno: turma.turno,
            respondentPeriodo: turma.periodo,
            submetidoEm,
          },
        });
        conjuntos++;

        for (const q of bloco.questoes) {
          const answerId = randomUUID();
          const cfg = (q.config ?? {}) as { min?: number; max?: number; permiteNaoSeAplica?: boolean };
          let dados: Record<string, unknown> = {};
          let escolhidas: string[] = [];

          if (q.tipo === 'LIKERT' || q.tipo === 'NPS') {
            const min = cfg.min ?? 1;
            const max = cfg.max ?? 4;
            // Uma em cada seis marca "não se aplica", onde isso é permitido.
            dados =
              cfg.permiteNaoSeAplica && pessoa % 6 === 0
                ? { naoSeAplica: true }
                : { valorNumerico: min + (pessoa % (max - min + 1)) };
          } else if (q.tipo === 'TEXTO_LIVRE') {
            dados = {
              valorTexto: `Comentário sintético ${pessoa + 1} sobre "${bloco.titulo}".`,
              // Um terço já moderado, para a fila não nascer toda pendente.
              ...(pessoa % 3 === 0
                ? { moderacao: 'APROVADO' as const, moderadoEm: new Date() }
                : {}),
            };
          } else if (q.tipo === 'SIM_NAO') {
            dados = { valorBooleano: pessoa % 2 === 0 };
          } else if (q.opcoes.length > 0) {
            escolhidas =
              q.tipo === 'ESCOLHA_MULTIPLA'
                ? q.opcoes.slice(pessoa % 3, (pessoa % 3) + 2).map((o) => o.id)
                : [q.opcoes[pessoa % q.opcoes.length].id];
          }

          await prisma.answer.create({
            data: { id: answerId, responseSetId: setId, questionId: q.id, ...dados },
          });
          respostas++;

          if (escolhidas.length > 0) {
            await prisma.answerOption.createMany({
              data: escolhidas.map((optionId) => ({ answerId, optionId })),
            });
          }
        }
      }
    }
  }

  console.log('');
  console.log(`formulário .. ${form.nome}`);
  console.log(`ciclo ....... ${ciclo.id}`);
  console.log(`pessoas ..... ${PESSOAS}`);
  console.log(`conjuntos ... ${conjuntos}`);
  console.log(`respostas ... ${respostas}`);
  console.log('');
  console.log(`  http://localhost:3000/relatorios?ciclo=${ciclo.id}`);
  console.log('');
}

async function main(): Promise<void> {
  exigirBancoLocal();
  await (process.argv.includes('limpar') ? limpar() : semear());
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
