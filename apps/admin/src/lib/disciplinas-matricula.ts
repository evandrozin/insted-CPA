/**
 * Quais disciplinas de um aluno viram card de professor, e por que as outras não.
 *
 * Fica à parte porque a lista de matrículas (que conta) e a página de detalhe
 * (que explica) precisam da MESMA regra — se uma dissesse 7 e a outra mostrasse
 * 6 disciplinas com card, a CPA deixaria de confiar nas duas. A regra espelha a
 * de `GeradorDeAlvos.alvosDoAluno`: inscrição ativa, oferta ativa, disciplina e
 * curso da disciplina ativos, e matrícula da turma que não esteja inativa.
 */
import type { Prisma } from '@insted/database';

/** O que se lê de cada inscrição do aluno (StudentSubject). */
export const SELECAO_INSCRICAO = {
  id: true,
  ativo: true,
  assignment: {
    select: {
      id: true,
      ativo: true,
      modalidade: true,
      classId: true,
      teacher: { select: { nome: true } },
      term: { select: { codigo: true, ano: true, semestre: true } },
      subject: {
        select: {
          nome: true,
          ativo: true,
          course: { select: { nome: true, ativo: true } },
        },
      },
    },
  },
} satisfies Prisma.StudentSubjectSelect;

export type Inscricao = Prisma.StudentSubjectGetPayload<{ select: typeof SELECAO_INSCRICAO }>;

/**
 * Por que a inscrição NÃO gera card — ou `null` se gera.
 *
 * `matriculaDaTurmaAtiva` é `null` quando o aluno não tem matrícula naquela
 * turma (optativa, DP): a oferta continua valendo, como no gerador.
 */
export function motivoSemCard(
  i: Inscricao,
  matriculaDaTurmaAtiva: boolean | null,
): string | null {
  const a = i.assignment;
  if (!i.ativo) return 'inscrição desligada';
  if (!a.ativo) return 'oferta inativa';
  if (!a.subject.ativo) return 'disciplina inativa';
  if (a.subject.course && !a.subject.course.ativo) return 'curso da disciplina inativo';
  if (matriculaDaTurmaAtiva === false) return 'matrícula da turma inativa';
  return null;
}

/** Inscrições de uma turma do aluno, com a regra aplicada. */
export function disciplinasDaTurma(
  inscricoes: Inscricao[],
  classId: string,
  matriculaAtiva: boolean | null,
) {
  const daTurma = inscricoes.filter((i) => i.assignment.classId === classId);
  const comMotivo = daTurma.map((i) => ({ inscricao: i, motivo: motivoSemCard(i, matriculaAtiva) }));
  return {
    todas: comMotivo,
    comCard: comMotivo.filter((x) => x.motivo === null).length,
  };
}
