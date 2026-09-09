'use server';

/**
 * Correção de alocações docentes.
 *
 * A alocação é o registro mais consequente da importação: é ele que decide
 * quem cada aluno avalia. Quando o JACAD traz errado — professor trocado,
 * modalidade ausente, oferta que não deveria ser avaliada — a correção precisa
 * ser feita aqui e **sobreviver ao próximo sync**, por isso `edicaoManual`.
 *
 * Uma alocação que já recebeu resposta não é mais editável: trocar o professor
 * depois faria as notas de um aparecerem no relatório do outro.
 */
import { revalidatePath } from 'next/cache';
import { exigirPainel } from '@/lib/sessao';
import { redirect } from 'next/navigation';
import { prisma, type Modalidade } from '@insted/database';

const MODALIDADES: Modalidade[] = ['PRESENCIAL', 'EAD', 'SEMIPRESENCIAL', 'NAO_INFORMADA'];

/** Uma alocação com respostas gravadas está congelada. */
async function exigirSemRespostas(assignmentId: string) {
  const respostas = await prisma.responseSet.count({ where: { targetRefId: assignmentId } });
  if (respostas > 0) {
    throw new Error(
      `Esta alocação já recebeu ${respostas} ${respostas === 1 ? 'resposta' : 'respostas'} e não ` +
        'pode mais ser alterada — mudar o professor agora moveria notas de uma pessoa para outra.',
    );
  }
}

function voltar(dados: FormData): void {
  const destino = String(dados.get('volta') ?? '');
  if (destino.startsWith('/') && !destino.startsWith('//')) redirect(destino);
}

/** Tira a oferta do ciclo (ou devolve). */
export async function alternarAlocacaoAtiva(assignmentId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  await exigirSemRespostas(assignmentId);

  const atual = await prisma.teachingAssignment.findUnique({
    where: { id: assignmentId },
    select: { ativo: true },
  });
  if (!atual) throw new Error('Alocação não encontrada.');

  await prisma.teachingAssignment.update({
    where: { id: assignmentId },
    data: { ativo: !atual.ativo, edicaoManual: true },
  });

  await prisma.auditLog.create({
    data: {
      acao: atual.ativo ? 'ALLOCATION_DEACTIVATE' : 'ALLOCATION_ACTIVATE',
      entidade: 'TeachingAssignment',
      entidadeId: assignmentId,
    },
  });

  revalidatePath('/alocacoes/docentes');
  voltar(dados);
}

/** Corrige a modalidade desta oferta específica. */
export async function definirModalidadeAlocacao(
  assignmentId: string,
  dados: FormData,
): Promise<void> {
  await exigirPainel();

  await exigirSemRespostas(assignmentId);

  const escolhida = String(dados.get('modalidade') ?? '') as Modalidade;
  if (!MODALIDADES.includes(escolhida)) throw new Error('Modalidade inválida.');

  await prisma.teachingAssignment.update({
    where: { id: assignmentId },
    data: { modalidade: escolhida, edicaoManual: true },
  });

  await prisma.auditLog.create({
    data: {
      acao: 'ALLOCATION_SET_MODALITY',
      entidade: 'TeachingAssignment',
      entidadeId: assignmentId,
      dadosDepois: { modalidade: escolhida },
    },
  });

  revalidatePath('/alocacoes/docentes');
  voltar(dados);
}

/**
 * Troca o docente da oferta.
 *
 * O professor original fica registrado em `teacherOriginalId`: se o JACAD
 * continuar mandando o antigo, dá para saber que a divergência é conhecida e
 * foi resolvida aqui — e não um erro novo.
 */
export async function trocarProfessor(assignmentId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  await exigirSemRespostas(assignmentId);

  const novoId = String(dados.get('teacherId') ?? '');
  if (!novoId) throw new Error('Selecione o professor.');

  const [alocacao, novo] = await Promise.all([
    prisma.teachingAssignment.findUnique({
      where: { id: assignmentId },
      select: { teacherId: true, teacherOriginalId: true, subjectId: true, classId: true, termId: true },
    }),
    prisma.user.findUnique({ where: { id: novoId }, select: { id: true, role: true, nome: true } }),
  ]);

  if (!alocacao) throw new Error('Alocação não encontrada.');
  if (!novo || novo.role !== 'PROFESSOR') throw new Error('Usuário selecionado não é professor.');
  if (novo.id === alocacao.teacherId) return voltar(dados);

  // A chave única é (professor, disciplina, turma, semestre): se já existe
  // alocação do novo docente nessa mesma oferta, trocar criaria duplicata.
  const conflito = await prisma.teachingAssignment.findUnique({
    where: {
      teacherId_subjectId_classId_termId: {
        teacherId: novoId,
        subjectId: alocacao.subjectId,
        classId: alocacao.classId,
        termId: alocacao.termId,
      },
    },
    select: { id: true },
  });
  if (conflito) {
    throw new Error(
      `${novo.nome} já está alocado nesta disciplina e turma. Em vez de trocar, tire do ciclo a alocação incorreta.`,
    );
  }

  await prisma.teachingAssignment.update({
    where: { id: assignmentId },
    data: {
      teacherId: novoId,
      // Preserva o PRIMEIRO original: trocas sucessivas não apagam a origem.
      teacherOriginalId: alocacao.teacherOriginalId ?? alocacao.teacherId,
      edicaoManual: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      acao: 'ALLOCATION_CHANGE_TEACHER',
      entidade: 'TeachingAssignment',
      entidadeId: assignmentId,
      dadosAntes: { teacherId: alocacao.teacherId },
      dadosDepois: { teacherId: novoId },
    },
  });

  revalidatePath('/alocacoes/docentes');
  voltar(dados);
}
