'use server';

/**
 * Resposta do aluno.
 *
 * Duas operações, com garantias diferentes:
 *
 * `salvarEtapa` grava rascunho. O rascunho É identificável — está preso à
 * tarefa, que é do respondente. É o único ponto do sistema em que resposta e
 * pessoa coexistem, e ele existe só enquanto o formulário não foi enviado.
 *
 * `enviar` faz a travessia para o anonimato, numa transação: cria os
 * `ResponseSet` SEM qualquer vínculo com o usuário, apaga todos os rascunhos e
 * marca a tarefa como concluída. Depois disso, o sistema sabe que a pessoa
 * respondeu e sabe o que foi respondido, mas não tem como ligar as duas coisas.
 */
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { respondenteAtual } from '@/lib/sessao';

/** A tarefa é do usuário da sessão e o ciclo está aberto? */
async function tarefaDoRespondente(taskId: string) {
  const eu = await respondenteAtual();
  if (!eu) redirect('/entrar');

  const task = await prisma.evaluationTask.findUnique({
    where: { id: taskId },
    include: {
      period: { select: { status: true, fechaEm: true, mensagemConclusao: true } },
      periodForm: { select: { id: true, anonimo: true } },
    },
  });

  if (!task || task.respondentId !== eu.id) {
    // Mesma resposta para "não existe" e "não é sua": distinguir permitiria
    // descobrir tarefas de outras pessoas por tentativa.
    throw new Error('Avaliação não encontrada.');
  }
  if (task.status === 'CONCLUIDA') throw new Error('Você já enviou esta avaliação.');
  if (task.period.status !== 'ABERTO') throw new Error('O período de avaliação não está aberto.');
  if (task.period.fechaEm < new Date()) throw new Error('O prazo desta avaliação encerrou.');

  return { eu, task };
}

/**
 * Lê as respostas do formulário.
 *
 * Campos vêm como `r:<questionId>:<targetRefId>`; `targetRefId` é
 * `__global__` para blocos de alvo único.
 */
function lerRespostas(dados: FormData) {
  const out: { questionId: string; targetRefId: string; valor: unknown }[] = [];

  for (const [chave, bruto] of dados.entries()) {
    if (!chave.startsWith('r:')) continue;
    const [, questionId, targetRefId] = chave.split(':');
    const v = String(bruto);
    if (v === '') continue;

    out.push({
      questionId,
      targetRefId: targetRefId || '__global__',
      valor:
        v === '__na__'
          ? { naoSeAplica: true }
          : /^-?\d+$/.test(v)
            ? { numerico: Number(v) }
            : v === 'sim' || v === 'nao'
              ? { booleano: v === 'sim' }
              : { texto: v },
    });
  }
  return out;
}

/** Salva o passo atual e vai para o próximo (ou para a revisão). */
export async function salvarEtapa(taskId: string, dados: FormData): Promise<void> {
  const { task } = await tarefaDoRespondente(taskId);
  const respostas = lerRespostas(dados);

  if (respostas.length > 0) {
    await prisma.$transaction(
      respostas.map((r) =>
        prisma.draftAnswer.upsert({
          where: {
            taskId_questionId_targetRefId: {
              taskId,
              questionId: r.questionId,
              targetRefId: r.targetRefId,
            },
          },
          create: { taskId, ...r, valor: r.valor as object },
          update: { valor: r.valor as object },
        }),
      ),
    );
  }

  // Progresso é contagem simples porque os alvos já estão materializados.
  const [respondidas, totalPrevisto] = await Promise.all([
    prisma.draftAnswer.count({ where: { taskId } }),
    contarQuestoesPrevistas(taskId),
  ]);

  await prisma.evaluationTask.update({
    where: { id: taskId },
    data: {
      status: 'EM_ANDAMENTO',
      iniciadaEm: task.iniciadaEm ?? new Date(),
      progresso: totalPrevisto ? Math.min(99, Math.round((respondidas / totalPrevisto) * 100)) : 0,
    },
  });

  const destino = String(dados.get('destino') ?? '');
  revalidatePath(`/responder/${taskId}`);
  redirect(destino || `/responder/${taskId}`);
}

/** Quantas respostas o formulário inteiro espera, somando os alvos. */
async function contarQuestoesPrevistas(taskId: string): Promise<number> {
  const alvos = await prisma.evaluationTaskTarget.findMany({
    where: { taskId },
    select: { blockId: true },
  });
  if (alvos.length === 0) return 0;

  const porBloco = await prisma.question.groupBy({
    by: ['blockId'],
    where: { blockId: { in: [...new Set(alvos.map((a) => a.blockId))] }, ativa: true },
    _count: true,
  });
  const mapa = new Map(porBloco.map((b) => [b.blockId, b._count]));

  return alvos.reduce((s, a) => s + (mapa.get(a.blockId) ?? 0), 0);
}

/**
 * Envio final — a travessia para o anonimato.
 *
 * Tudo numa transação: ou a resposta vira anônima e o rascunho some, ou nada
 * acontece. Um estado intermediário deixaria rascunho identificável junto com
 * resposta anônima, que é exatamente o que não pode existir.
 */
export async function enviar(taskId: string, dados: FormData): Promise<void> {
  const { eu, task } = await tarefaDoRespondente(taskId);

  // Salva o que estiver na tela antes de fechar.
  const ultimas = lerRespostas(dados);
  if (ultimas.length > 0) {
    await prisma.$transaction(
      ultimas.map((r) =>
        prisma.draftAnswer.upsert({
          where: {
            taskId_questionId_targetRefId: {
              taskId,
              questionId: r.questionId,
              targetRefId: r.targetRefId,
            },
          },
          create: { taskId, ...r, valor: r.valor as object },
          update: { valor: r.valor as object },
        }),
      ),
    );
  }

  const [rascunhos, alvos, matricula] = await Promise.all([
    prisma.draftAnswer.findMany({ where: { taskId } }),
    prisma.evaluationTaskTarget.findMany({ where: { taskId } }),
    // O recorte que acompanha a resposta: curso e turma, nunca a pessoa.
    prisma.enrollment.findFirst({
      where: { studentId: eu.id, ativo: true },
      select: { class: { select: { id: true, courseId: true, turno: true, periodo: true } } },
      orderBy: { criadoEm: 'desc' },
    }),
  ]);

  if (rascunhos.length === 0) throw new Error('Nenhuma resposta preenchida.');

  const porAlvo = new Map<string, typeof rascunhos>();
  for (const r of rascunhos) {
    const lista = porAlvo.get(r.targetRefId) ?? [];
    lista.push(r);
    porAlvo.set(r.targetRefId, lista);
  }

  const alvoPorRef = new Map(alvos.map((a) => [a.targetRefId ?? '__global__', a]));

  // Ordem embaralhada: se os ResponseSet fossem gravados na ordem dos alvos,
  // a sequência de ids somada ao carimbo de tempo permitiria reagrupar os
  // conjuntos de um mesmo respondente.
  const grupos = [...porAlvo.entries()].sort(() => Math.random() - 0.5);

  // Lote da submissão: o vínculo deliberado entre esta pessoa e o que ela
  // gravou. Existe para que um envio feito por engano possa ser retratado, e
  // morre quando o ciclo encerra (ver encerrarCiclo).
  const loteId = randomUUID();

  // Carimbo arredondado para o dia. Com precisão de milissegundo, este campo e
  // o `concluidaEm` da tarefa ficariam a poucos milissegundos de distância, e
  // reagrupar as respostas de cada aluno seria uma consulta trivial — o lote
  // acima passaria a ser uma formalidade, porque o relógio já entregaria tudo.
  //
  // Guardado como meia-noite UTC do dia local: a meia-noite local viraria
  // 03:00 ou 04:00 na coluna, um horário que não quer dizer nada e convida a
  // interpretação errada de quem for ler o banco.
  const hoje = new Date();
  const diaDoEnvio = new Date(
    Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()),
  );

  const ofertas = await prisma.teachingAssignment.findMany({
    where: { id: { in: alvos.map((a) => a.targetRefId).filter(Boolean) as string[] } },
    select: { id: true, teacherId: true, subjectId: true },
  });
  const ofertaPorId = new Map(ofertas.map((o) => [o.id, o]));

  await prisma.$transaction(async (tx) => {
    for (const [targetRefId, itens] of grupos) {
      const alvo = alvoPorRef.get(targetRefId);
      if (!alvo) continue;

      const oferta = targetRefId !== '__global__' ? ofertaPorId.get(targetRefId) : undefined;

      const conjunto = await tx.responseSet.create({
        data: {
          periodId: task.periodId,
          periodFormId: task.periodFormId,
          blockId: alvo.blockId,
          targetType: alvo.targetType,
          targetRefId: alvo.targetRefId,
          teacherId: oferta?.teacherId ?? null,
          subjectId: oferta?.subjectId ?? null,
          departmentId: alvo.targetType === 'DEPARTAMENTO' ? alvo.targetRefId : null,
          courseId: alvo.targetType === 'CURSO' ? alvo.targetRefId : null,
          // ---- recorte do respondente: agregado, nunca identificável ----
          respondentRole: 'ALUNO',
          respondentCourseId: matricula?.class.courseId ?? null,
          respondentClassId: matricula?.class.id ?? null,
          respondentTurno: matricula?.class.turno ?? null,
          respondentPeriodo: matricula?.class.periodo ?? null,
          anonimo: task.periodForm.anonimo,
          submetidoEm: diaDoEnvio,
          loteId,
        },
      });

      for (const item of itens) {
        const v = item.valor as {
          numerico?: number;
          texto?: string;
          booleano?: boolean;
          naoSeAplica?: boolean;
        };
        await tx.answer.create({
          data: {
            responseSetId: conjunto.id,
            questionId: item.questionId,
            valorNumerico: v.numerico ?? null,
            valorTexto: v.texto ?? null,
            valorBooleano: v.booleano ?? null,
            naoSeAplica: Boolean(v.naoSeAplica),
          },
        });
      }
    }

    // O rascunho é a única estrutura que liga resposta e pessoa. Some aqui.
    await tx.draftAnswer.deleteMany({ where: { taskId } });

    await tx.evaluationTask.update({
      where: { id: taskId },
      data: { status: 'CONCLUIDA', progresso: 100, concluidaEm: new Date(), loteId },
    });
  });

  revalidatePath('/minhas-avaliacoes');
  redirect(`/responder/${taskId}/concluido`);
}
