'use server';

/**
 * Edição de formulários pela interface.
 *
 * Server Actions escrevendo direto no banco. É provisório e consciente: a
 * arquitetura prevê o admin consumindo a API NestJS, que ainda não existe.
 * Quando ela entrar, estas funções viram chamadas HTTP e as regras (RBAC,
 * auditoria) passam a viver num lugar só. Até lá, cada ação repete aqui a
 * única regra que não pode faltar: formulário PUBLICADO é imutável.
 *
 * Reordenação: `ordem` tem constraint única por bloco (e por formulário), então
 * uma troca direta violaria o índice no meio da transação. Por isso o swap
 * passa por uma ordem temporária negativa.
 */
import { revalidatePath } from 'next/cache';
import { exigirPainel } from '@/lib/sessao';
import { prisma, type TargetType } from '@insted/database';
import { TIPOS_ALVO, ALVOS_REPETIVEIS } from './alvos';

const TEMP = -1;

/** Publicado é imutável — a série histórica da CPA depende disso. */
async function exigirRascunho(formId: string): Promise<string | null> {
  const form = await prisma.formTemplate.findUnique({
    where: { id: formId },
    select: { status: true },
  });
  if (!form) return 'Formulário não encontrado.';
  if (form.status !== 'RASCUNHO') {
    return 'Este formulário está publicado e não pode ser alterado. Crie uma nova versão.';
  }
  return null;
}

async function formIdDaQuestao(questionId: string) {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { block: { select: { formId: true, id: true } } },
  });
  return q?.block ?? null;
}

// ------------------------------------------------------------------ questões

export async function salvarQuestao(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const enunciado = String(dados.get('enunciado') ?? '').trim();
  const ajuda = String(dados.get('ajuda') ?? '').trim();

  if (!enunciado) throw new Error('O enunciado não pode ficar vazio.');

  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  await prisma.question.update({
    where: { id: questionId },
    data: { enunciado, ajuda: ajuda || null },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

export async function alternarObrigatoria(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const atual = await prisma.question.findUnique({
    where: { id: questionId },
    select: { obrigatoria: true },
  });
  await prisma.question.update({
    where: { id: questionId },
    data: { obrigatoria: !atual?.obrigatoria },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

/** Peso 0 tira a questão da média do bloco — útil para itens informativos. */
export async function alternarPeso(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const atual = await prisma.question.findUnique({
    where: { id: questionId },
    select: { peso: true },
  });
  await prisma.question.update({
    where: { id: questionId },
    data: { peso: Number(atual?.peso) === 0 ? 1 : 0 },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

/**
 * A direção vem por bind, não por campo do formulário: o React usa o atributo
 * `name` do botão para carregar o id da Server Action, e um `name` próprio é
 * sobrescrito — o valor nunca chegaria aqui.
 */
export async function moverQuestao(sentido: 'cima' | 'baixo', dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const direcao = sentido === 'cima' ? -1 : 1;

  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, ordem: true, blockId: true, block: { select: { formId: true } } },
  });
  if (!q) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(q.block.formId);
  if (impedimento) throw new Error(impedimento);

  const vizinha = await prisma.question.findFirst({
    where: { blockId: q.blockId, ordem: q.ordem + direcao },
    select: { id: true, ordem: true },
  });
  if (!vizinha) return; // já está na ponta

  await prisma.$transaction([
    prisma.question.update({ where: { id: q.id }, data: { ordem: TEMP } }),
    prisma.question.update({ where: { id: vizinha.id }, data: { ordem: q.ordem } }),
    prisma.question.update({ where: { id: q.id }, data: { ordem: vizinha.ordem } }),
  ]);

  revalidatePath(`/formularios/${q.block.formId}`);
}

export async function excluirQuestao(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { ordem: true, blockId: true, block: { select: { formId: true } } },
  });
  if (!q) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(q.block.formId);
  if (impedimento) throw new Error(impedimento);

  // Fecha o buraco na numeração para manter a ordem contígua.
  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });
    const posteriores = await tx.question.findMany({
      where: { blockId: q.blockId, ordem: { gt: q.ordem } },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true },
    });
    for (const p of posteriores) {
      await tx.question.update({ where: { id: p.id }, data: { ordem: p.ordem - 1 } });
    }
  });

  revalidatePath(`/formularios/${q.block.formId}`);
}

export async function adicionarQuestao(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const bloco = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, questoes: { orderBy: { ordem: 'desc' }, take: 1 } },
  });
  if (!bloco) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  // Herda a escala da última questão, que é quase sempre o que se quer.
  const ultima = bloco.questoes[0];

  await prisma.question.create({
    data: {
      blockId,
      enunciado: 'Nova questão — escreva o enunciado aqui.',
      tipo: ultima?.tipo ?? 'LIKERT',
      ordem: (ultima?.ordem ?? 0) + 1,
      config: (ultima?.config ?? undefined) as object | undefined,
    },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

// -------------------------------------------------------------------- blocos

export async function salvarBloco(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const titulo = String(dados.get('titulo') ?? '').trim();
  const descricao = String(dados.get('descricao') ?? '').trim();
  const targetType = String(dados.get('targetType') ?? '') as TargetType;
  const repetivelPedido = dados.get('repetivel') === 'on';

  if (!titulo) throw new Error('O título do bloco não pode ficar vazio.');

  const bloco = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, targetType: true, repetivel: true },
  });
  if (!bloco) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const alvo = TIPOS_ALVO.includes(targetType) ? targetType : bloco.targetType;
  // "Repetir" sobre um alvo único geraria um card só — silenciosamente inútil.
  const repetivel = repetivelPedido && ALVOS_REPETIVEIS.includes(alvo);

  await prisma.questionBlock.update({
    where: { id: blockId },
    data: { titulo, descricao: descricao || null, targetType: alvo, repetivel },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

export async function adicionarBloco(dados: FormData): Promise<void> {
  await exigirPainel();

  const formId = String(dados.get('formId') ?? '');
  const impedimento = await exigirRascunho(formId);
  if (impedimento) throw new Error(impedimento);

  const ultimo = await prisma.questionBlock.findFirst({
    where: { formId },
    orderBy: { ordem: 'desc' },
    select: { ordem: true },
  });

  await prisma.questionBlock.create({
    data: {
      formId,
      titulo: 'Novo bloco',
      ordem: (ultimo?.ordem ?? 0) + 1,
      targetType: 'INSTITUICAO',
    },
  });

  revalidatePath(`/formularios/${formId}`);
}

export async function excluirBloco(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const bloco = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, ordem: true, _count: { select: { questoes: true } } },
  });
  if (!bloco) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  // As questões vão junto por cascade; fechamos o buraco na ordem depois.
  await prisma.$transaction(async (tx) => {
    await tx.questionBlock.delete({ where: { id: blockId } });
    const posteriores = await tx.questionBlock.findMany({
      where: { formId: bloco.formId, ordem: { gt: bloco.ordem } },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true },
    });
    for (const p of posteriores) {
      await tx.questionBlock.update({ where: { id: p.id }, data: { ordem: p.ordem - 1 } });
    }
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

export async function moverBloco(sentido: 'cima' | 'baixo', dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const direcao = sentido === 'cima' ? -1 : 1;

  const b = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { id: true, ordem: true, formId: true },
  });
  if (!b) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(b.formId);
  if (impedimento) throw new Error(impedimento);

  const vizinho = await prisma.questionBlock.findFirst({
    where: { formId: b.formId, ordem: b.ordem + direcao },
    select: { id: true, ordem: true },
  });
  if (!vizinho) return;

  await prisma.$transaction([
    prisma.questionBlock.update({ where: { id: b.id }, data: { ordem: TEMP } }),
    prisma.questionBlock.update({ where: { id: vizinho.id }, data: { ordem: b.ordem } }),
    prisma.questionBlock.update({ where: { id: b.id }, data: { ordem: vizinho.ordem } }),
  ]);

  revalidatePath(`/formularios/${b.formId}`);
}

/**
 * Marca o bloco como repetível por professor — a conversão que a CPA precisa
 * decidir para ter nota por docente em vez de nota do "corpo docente".
 */
export async function alternarRepetivelDocente(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const b = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, repetivel: true, targetType: true },
  });
  if (!b) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(b.formId);
  if (impedimento) throw new Error(impedimento);

  const virandoRepetivel = !b.repetivel;

  await prisma.questionBlock.update({
    where: { id: blockId },
    data: {
      repetivel: virandoRepetivel,
      targetType: virandoRepetivel ? 'PROFESSOR_DISCIPLINA' : 'INSTITUICAO',
    },
  });

  revalidatePath(`/formularios/${b.formId}`);
}
