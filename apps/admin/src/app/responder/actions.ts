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
import { prisma, Prisma as PrismaRuntime } from '@insted/database';
import type { Prisma } from '@insted/database';
import { respondenteAtual } from '@/lib/sessao';
import { condicaoSatisfeita, lerCondicao, type ValorRespondido } from '@/lib/condicao';

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
 *
 * Um campo pode chegar repetido: caixas de seleção mandam uma entrada por caixa
 * marcada. Por isso os valores são agrupados por campo antes de virar resposta —
 * percorrer entrada por entrada guardaria só a última marcada.
 */
function lerRespostas(dados: FormData) {
  const porCampo = new Map<string, string[]>();

  for (const [chave, bruto] of dados.entries()) {
    if (!chave.startsWith('r:')) continue;
    const v = String(bruto);
    if (v === '') continue;
    porCampo.set(chave, [...(porCampo.get(chave) ?? []), v]);
  }

  return [...porCampo].map(([chave, valores]) => {
    const [, questionId, targetRefId] = chave.split(':');
    return { questionId, targetRefId: targetRefId || '__global__', valor: interpretar(valores) };
  });
}

/**
 * Traduz o que veio da tela para o formato guardado no rascunho.
 *
 * Opção escolhida chega como `o:<id>` e é guardada como id, não como rótulo: a
 * CPA pode corrigir a redação de uma alternativa sem desmentir quem já
 * respondeu, e contar quantos marcaram cada uma vira uma consulta simples.
 */
function interpretar(valores: string[]): unknown {
  if (valores.includes('__na__')) return { naoSeAplica: true };

  const opcoes = valores.filter((v) => v.startsWith('o:')).map((v) => v.slice(2));
  if (opcoes.length > 0) return { opcoes };

  const v = valores[valores.length - 1];
  if (/^-?\d+$/.test(v)) return { numerico: Number(v) };
  if (v === 'sim' || v === 'nao') return { booleano: v === 'sim' };
  return { texto: v };
}

type RespostaLida = { questionId: string; targetRefId: string; valor: unknown };

/**
 * Tira do caminho a resposta de pergunta que não deveria ter aparecido.
 *
 * A tela esconde a pergunta condicional, mas esconder é conforto: o navegador
 * é do respondente, e um formulário montado à mão enviaria o campo assim
 * mesmo. Quem decide o que entra no banco é esta função.
 *
 * Ela também APAGA o rascunho do que foi descartado: o aluno pode ter
 * respondido "o que atrapalha" e depois mudado a nota de permanência para 9 —
 * a resposta antiga ficaria no banco contando como se ele ainda achasse aquilo.
 */
async function aplicarCondicoes(
  taskId: string,
  respostas: RespostaLida[],
): Promise<RespostaLida[]> {
  if (respostas.length === 0) return respostas;

  const condicionais = await prisma.question.findMany({
    where: {
      id: { in: respostas.map((r) => r.questionId) },
      condicao: { not: PrismaRuntime.DbNull },
    },
    select: { id: true, condicao: true },
  });
  if (condicionais.length === 0) return respostas;

  const chave = (questionId: string, ref: string) => `${questionId}:${ref}`;
  const valores = new Map<string, ValorRespondido>(
    respostas.map((r) => [chave(r.questionId, r.targetRefId), r.valor as ValorRespondido]),
  );

  // A pergunta que controla pode não estar neste envio — o aluno respondeu
  // numa visita anterior e voltou para completar. Nesse caso vale o rascunho.
  const faltantes = condicionais
    .map((q) => lerCondicao(q.condicao)?.questionId)
    .filter((id): id is string => Boolean(id));

  if (faltantes.length > 0) {
    const rascunhos = await prisma.draftAnswer.findMany({
      where: { taskId, questionId: { in: faltantes } },
      select: { questionId: true, targetRefId: true, valor: true },
    });
    for (const r of rascunhos) {
      const k = chave(r.questionId, r.targetRefId);
      if (!valores.has(k)) valores.set(k, r.valor as ValorRespondido);
    }
  }

  const condicaoPorQuestao = new Map(
    condicionais.map((q) => [q.id, lerCondicao(q.condicao)]),
  );

  const manter: RespostaLida[] = [];
  const descartar: RespostaLida[] = [];

  for (const r of respostas) {
    const condicao = condicaoPorQuestao.get(r.questionId);
    if (!condicao) {
      manter.push(r);
      continue;
    }
    const controle = valores.get(chave(condicao.questionId, r.targetRefId));
    (condicaoSatisfeita(condicao, controle) ? manter : descartar).push(r);
  }

  if (descartar.length > 0) {
    await prisma.draftAnswer.deleteMany({
      where: {
        taskId,
        OR: descartar.map((r) => ({
          questionId: r.questionId,
          targetRefId: r.targetRefId,
        })),
      },
    });
  }

  return manter;
}

/**
 * Etapas em que falta responder pergunta obrigatória.
 *
 * `obrigatoria` existia no banco desde o início e ninguém a lia: dava para
 * percorrer o questionário inteiro sem responder nada e enviar assim. O
 * resultado parecia completo e não era.
 *
 * Duas regras, para a exigência não virar armadilha:
 *
 * - BLOCO NÃO OBRIGATÓRIO não exige nada. É o caso do card por professor: o
 *   instrumento manda avaliar só quem o aluno conheceu o suficiente, e forçar
 *   produziria nota inventada.
 * - PERGUNTA CONDICIONAL só é exigida quando a condição se cumpre. Exigir o
 *   que a tela escondeu prenderia o aluno numa etapa sem saída.
 */
async function etapasIncompletas(
  taskId: string,
): Promise<{ etapa: number; bloco: string; faltam: number; questoes: string[] }[]> {
  const [alvos, rascunhos] = await Promise.all([
    prisma.evaluationTaskTarget.findMany({
      where: { taskId },
      orderBy: { ordem: 'asc' },
      select: { blockId: true, targetRefId: true },
    }),
    prisma.draftAnswer.findMany({
      where: { taskId },
      select: { questionId: true, targetRefId: true, valor: true },
    }),
  ]);
  if (alvos.length === 0) return [];

  const blocos = await prisma.questionBlock.findMany({
    where: { id: { in: [...new Set(alvos.map((a) => a.blockId))] } },
    select: {
      id: true,
      titulo: true,
      obrigatorio: true,
      questoes: {
        where: { ativa: true },
        orderBy: { ordem: 'asc' },
        select: { id: true, enunciado: true, obrigatoria: true, condicao: true },
      },
    },
  });
  const porBloco = new Map(blocos.map((b) => [b.id, b]));

  const respondido = new Map(
    rascunhos.map((r) => [`${r.questionId}:${r.targetRefId}`, r.valor as ValorRespondido]),
  );

  const pendentes: { etapa: number; bloco: string; faltam: number; questoes: string[] }[] = [];

  alvos.forEach((alvo, i) => {
    const bloco = porBloco.get(alvo.blockId);
    if (!bloco || !bloco.obrigatorio) return;

    const ref = alvo.targetRefId ?? '__global__';
    const faltando: string[] = [];

    for (const q of bloco.questoes) {
      if (!q.obrigatoria) continue;

      const condicao = lerCondicao(q.condicao);
      if (condicao && !condicaoSatisfeita(condicao, respondido.get(`${condicao.questionId}:${ref}`))) {
        continue;
      }
      if (!respondido.has(`${q.id}:${ref}`)) faltando.push(q.id);
    }

    if (faltando.length > 0) {
      // A etapa é a posição do alvo na fila, que é como a URL a identifica.
      pendentes.push({
        etapa: i + 1,
        bloco: bloco.titulo,
        faltam: faltando.length,
        questoes: faltando,
      });
    }
  });

  return pendentes;
}

/** Salva o passo atual e vai para o próximo (ou para a revisão). */
export async function salvarEtapa(taskId: string, dados: FormData): Promise<void> {
  const { task } = await tarefaDoRespondente(taskId);
  const respostas = await aplicarCondicoes(taskId, lerRespostas(dados));

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

  // Avançar só depois de completar a etapa. A gravação acontece antes: quem
  // respondeu metade não perde a metade por causa do bloqueio.
  const etapaAtual = Number(dados.get('etapa') ?? 0);
  const pendencia = (await etapasIncompletas(taskId)).find((p) => p.etapa === etapaAtual);

  revalidatePath(`/responder/${taskId}`);

  if (pendencia) {
    redirect(`/responder/${taskId}?e=${etapaAtual}&faltam=${pendencia.faltam}`);
  }

  const destino = String(dados.get('destino') ?? '');
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
  const ultimas = await aplicarCondicoes(taskId, lerRespostas(dados));
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

  // A trava que vale: a etapa pode ser pulada pela URL (`?e=7`), e o botão de
  // enviar está na revisão, que não passa por etapa nenhuma. Aqui o
  // questionário inteiro é conferido antes de virar resposta definitiva — e o
  // aluno volta para a PRIMEIRA etapa incompleta, não para uma mensagem genérica
  // que não diz onde faltou.
  const pendentes = await etapasIncompletas(taskId);
  if (pendentes.length > 0) {
    const primeira = pendentes[0];
    const total = pendentes.reduce((t, p) => t + p.faltam, 0);
    redirect(
      `/responder/${taskId}?e=${primeira.etapa}&faltam=${primeira.faltam}&total=${total}`,
    );
  }

  // Depois da conferência: um formulário sem nenhuma obrigatória poderia chegar
  // aqui vazio, e vazio não vira resposta.
  if (rascunhos.length === 0) throw new Error('Nenhuma resposta preenchida.');

  // Só entra opção que pertence à questão respondida. Sem esta conferência, um
  // campo adulterado no navegador gravaria marcação em alternativa de outra
  // pergunta — e o relatório contaria como se o aluno a tivesse escolhido.
  const opcoesDaQuestao = await prisma.questionOption.findMany({
    where: { questionId: { in: [...new Set(rascunhos.map((r) => r.questionId))] } },
    select: { id: true, questionId: true },
  });
  const opcaoValida = new Set(opcoesDaQuestao.map((o) => `${o.questionId}:${o.id}`));

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

  // Tudo montado em memória, gravado em lote.
  //
  // A versão anterior fazia uma consulta por resposta DENTRO da transação:
  // 9 conjuntos e 79 respostas eram ~90 idas ao banco em sequência. Com a
  // função na Vercel e o banco em São Paulo, cada ida custava ~120 ms, a
  // transação passava dos 5 s que o Prisma tolera e o envio falhava inteiro —
  // o aluno via erro depois de preencher tudo. Os ids são gerados aqui para
  // que conjuntos e respostas saiam em dois inserts, não em noventa.
  const conjuntos: Prisma.ResponseSetCreateManyInput[] = [];
  const respostas: Prisma.AnswerCreateManyInput[] = [];
  const marcacoes: Prisma.AnswerOptionCreateManyInput[] = [];

  for (const [targetRefId, itens] of grupos) {
    const alvo = alvoPorRef.get(targetRefId);
    if (!alvo) continue;

    const oferta = targetRefId !== '__global__' ? ofertaPorId.get(targetRefId) : undefined;
    const id = randomUUID();

    conjuntos.push({
      id,
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
    });

    for (const item of itens) {
      const v = item.valor as {
        numerico?: number;
        texto?: string;
        booleano?: boolean;
        naoSeAplica?: boolean;
        opcoes?: string[];
      };
      // Id gerado aqui pelo mesmo motivo dos conjuntos: as marcações precisam
      // apontar para a resposta antes de ela existir no banco.
      const respostaId = randomUUID();

      respostas.push({
        id: respostaId,
        responseSetId: id,
        questionId: item.questionId,
        valorNumerico: v.numerico ?? null,
        valorTexto: v.texto ?? null,
        valorBooleano: v.booleano ?? null,
        naoSeAplica: Boolean(v.naoSeAplica),
      });

      for (const optionId of v.opcoes ?? []) {
        if (!opcaoValida.has(`${item.questionId}:${optionId}`)) continue;
        marcacoes.push({ answerId: respostaId, optionId });
      }
    }
  }

  // Cinco consultas, na mesma transação de antes: ou a resposta vira anônima e
  // o rascunho some, ou nada acontece. O `createMany` insere na ordem do array,
  // então o embaralhamento de `grupos` continua valendo — e os ids são UUID
  // aleatório, sem sequência que denuncie quem gravou junto.
  await prisma.$transaction(
    async (tx) => {
      await tx.responseSet.createMany({ data: conjuntos });
      await tx.answer.createMany({ data: respostas });
      if (marcacoes.length > 0) await tx.answerOption.createMany({ data: marcacoes });

      // O rascunho é a única estrutura que liga resposta e pessoa. Some aqui.
      await tx.draftAnswer.deleteMany({ where: { taskId } });

      await tx.evaluationTask.update({
        where: { id: taskId },
        data: { status: 'CONCLUIDA', progresso: 100, concluidaEm: new Date(), loteId },
      });
    },
    // Margem, não muleta: são cinco consultas. O limite existe para que uma
    // falha de rede não segure a conexão do pooler indefinidamente.
    { timeout: 20_000, maxWait: 10_000 },
  );

  revalidatePath('/minhas-avaliacoes');
  redirect(`/responder/${taskId}/concluido`);
}
