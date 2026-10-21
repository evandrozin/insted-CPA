'use server';

/**
 * Ativar e desativar turmas pelo painel.
 *
 * Existe porque o JACAD manda turmas que não fazem parte do ciclo (as "PRAD",
 * as de demonstração) e, até aqui, não havia como tirá-las: o `ativo` da turma
 * estava no banco, mas nada o lia e nenhuma tela o mudava.
 *
 * Desativar uma turma:
 *
 * - tira a turma da geração de tarefas (o gerador só considera turmas ativas):
 *   quem só está nela deixa de ser elegível, e as ofertas dela não viram card;
 * - desativa as ofertas (alocações) dela — as "disciplinas vinculadas" — para
 *   que apareçam como "fora do ciclo" em Alocações docentes. Oferta que já tem
 *   resposta NÃO é mexida: é a mesma regra de Alocações, que a congela;
 * - NÃO toca em tarefa já gerada nem em matrícula. O ciclo em andamento segue
 *   como está; para tirar quem já recebeu tarefa existe "Retirar do ciclo".
 *
 * Ativar de novo devolve só as ofertas que ESTA ação desligou. Uma oferta que a
 * CPA tinha desligado à mão antes não pode voltar sozinha — por isso a marca
 * abaixo, que também lembra o `edicaoManual` que a oferta tinha.
 *
 * A importação do JACAD não reescreve `ativo` da turma, e preserva as ofertas com
 * `edicaoManual`; é o que faz a decisão durar além da próxima importação.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { lerFiltro, montarWhere } from './filtro';

type Novo = 'ATIVO' | 'INATIVO';
type Modo = 'marcadas' | 'filtro';

type Resultado = {
  turmas: number;
  /** Ofertas que mudaram junto com as turmas. */
  ofertas: number;
  /** Ofertas deixadas como estavam por já terem resposta. */
  congeladas: number;
  /** Alunos com tarefa em ciclo aberto que só estão nestas turmas (não foram tocados). */
  alunosComTarefa: number;
};

/** `[turma-inativa:0]` ou `[turma-inativa:1]` — o dígito é o `edicaoManual` de antes. */
const MARCA = /^\[turma-inativa:([01])\]\s?/;
const marcar = (edicaoManual: boolean, observacao: string | null) =>
  `[turma-inativa:${edicaoManual ? 1 : 0}]${observacao ? ` ${observacao}` : ''}`;

async function desativar(ids: string[]): Promise<Resultado> {
  const turmas = await prisma.schoolClass.findMany({
    where: { id: { in: ids }, ativo: true },
    select: { id: true },
  });
  const turmaIds = turmas.map((t) => t.id);
  if (turmaIds.length === 0) return { turmas: 0, ofertas: 0, congeladas: 0, alunosComTarefa: 0 };

  const ofertas = await prisma.teachingAssignment.findMany({
    where: { classId: { in: turmaIds }, ativo: true },
    select: { id: true, observacao: true, edicaoManual: true },
  });

  // Oferta com resposta é histórico: não se mexe (mesma regra de Alocações).
  const comResposta = new Set(
    (
      await prisma.responseSet.findMany({
        where: { targetRefId: { in: ofertas.map((o) => o.id) } },
        select: { targetRefId: true },
        distinct: ['targetRefId'],
      })
    ).map((r) => r.targetRefId),
  );
  const livres = ofertas.filter((o) => !comResposta.has(o.id));

  // Quem tem tarefa em ciclo aberto e só continua no ciclo por causa destas
  // turmas: não é alterado aqui, mas a CPA precisa saber que existe.
  const alunosComTarefa = await prisma.evaluationTask.findMany({
    where: {
      status: { not: 'DISPENSADA' },
      period: { status: { in: ['ABERTO', 'AGENDADO'] } },
      respondent: {
        matriculas: { some: { ativo: true, classId: { in: turmaIds } } },
        NOT: {
          matriculas: {
            some: { ativo: true, classId: { notIn: turmaIds }, class: { ativo: true } },
          },
        },
      },
    },
    select: { respondentId: true },
    distinct: ['respondentId'],
  });

  await prisma.$transaction([
    prisma.schoolClass.updateMany({ where: { id: { in: turmaIds } }, data: { ativo: false } }),
    ...livres.map((o) =>
      prisma.teachingAssignment.update({
        where: { id: o.id },
        data: {
          ativo: false,
          edicaoManual: true,
          observacao: marcar(o.edicaoManual, o.observacao),
        },
      }),
    ),
  ]);

  return {
    turmas: turmaIds.length,
    ofertas: livres.length,
    congeladas: ofertas.length - livres.length,
    alunosComTarefa: alunosComTarefa.length,
  };
}

async function reativar(ids: string[]): Promise<Resultado> {
  const turmas = await prisma.schoolClass.findMany({
    where: { id: { in: ids }, ativo: false },
    select: { id: true },
  });
  const turmaIds = turmas.map((t) => t.id);
  if (turmaIds.length === 0) return { turmas: 0, ofertas: 0, congeladas: 0, alunosComTarefa: 0 };

  // Só as ofertas que a desativação da turma desligou — a marca as distingue.
  const desligadas = await prisma.teachingAssignment.findMany({
    where: {
      classId: { in: turmaIds },
      ativo: false,
      observacao: { startsWith: '[turma-inativa:' },
    },
    select: { id: true, observacao: true },
  });

  await prisma.$transaction([
    prisma.schoolClass.updateMany({ where: { id: { in: turmaIds } }, data: { ativo: true } }),
    ...desligadas.map((o) => {
      const m = (o.observacao ?? '').match(MARCA);
      const resto = (o.observacao ?? '').replace(MARCA, '').trim();
      return prisma.teachingAssignment.update({
        where: { id: o.id },
        data: {
          ativo: true,
          edicaoManual: m?.[1] === '1',
          observacao: resto || null,
        },
      });
    }),
  ]);

  return { turmas: turmaIds.length, ofertas: desligadas.length, congeladas: 0, alunosComTarefa: 0 };
}

/** Volta para a lista, com o resumo só em números — nome de turma não viaja na URL. */
function concluir(dados: FormData, novo: Novo, r: Resultado): never {
  revalidatePath('/cadastros/turmas');
  revalidatePath('/alocacoes/docentes');

  const destino = String(dados.get('volta') ?? '');
  const base =
    destino.startsWith('/cadastros/turmas') && !destino.startsWith('//')
      ? destino.replace(/([?&])ok=[^&]*&?/, '$1').replace(/[?&]$/, '')
      : '/cadastros/turmas';

  const resumo = [novo, r.turmas, r.ofertas, r.congeladas, r.alunosComTarefa].join('.');
  redirect(`${base}${base.includes('?') ? '&' : '?'}ok=${resumo}`);
}

/** O botão de cada linha: liga ou desliga ESTA turma. */
export async function alternarTurma(classId: string, dados: FormData): Promise<void> {
  const eu = await exigirPainel();

  const turma = await prisma.schoolClass.findUnique({
    where: { id: classId },
    select: { id: true, nome: true, ativo: true },
  });
  if (!turma) throw new Error('Turma não encontrada.');

  const novo: Novo = turma.ativo ? 'INATIVO' : 'ATIVO';
  const r = novo === 'INATIVO' ? await desativar([classId]) : await reativar([classId]);

  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'TURMA_STATUS_MANUAL',
      entidade: 'SchoolClass',
      entidadeId: classId,
      dadosAntes: { ativo: turma.ativo },
      dadosDepois: { ativo: !turma.ativo, nome: turma.nome, ...r },
    },
  });

  concluir(dados, novo, r);
}

/** Lote: as turmas marcadas, ou tudo que casa com a aba e a busca atuais. */
export async function definirTurmasEmLote(
  novo: Novo,
  modo: Modo,
  dados: FormData,
): Promise<void> {
  const eu = await exigirPainel();

  if (novo !== 'ATIVO' && novo !== 'INATIVO') throw new Error('Situação inválida.');
  if (modo !== 'marcadas' && modo !== 'filtro') throw new Error('Modo inválido.');

  const q = String(dados.get('q') ?? '');
  const f = lerFiltro(dados.get('f'));

  let ids: string[];
  if (modo === 'marcadas') {
    ids = dados.getAll('ids').map(String).filter(Boolean);
    if (ids.length === 0) throw new Error('Nenhuma turma marcada.');
  } else {
    ids = (
      await prisma.schoolClass.findMany({ where: montarWhere(q, f), select: { id: true } })
    ).map((t) => t.id);
  }

  const r = novo === 'INATIVO' ? await desativar(ids) : await reativar(ids);

  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'TURMA_STATUS_MANUAL_LOTE',
      entidade: 'SchoolClass',
      dadosDepois: {
        situacao: novo,
        modo,
        filtro: f || null,
        busca: q || null,
        considerados: ids.length,
        ...r,
      },
    },
  });

  concluir(dados, novo, r);
}
