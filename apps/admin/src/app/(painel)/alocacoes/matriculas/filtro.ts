/**
 * Filtro da tela de matrículas, compartilhado entre a página e as ações.
 *
 * Fica fora de `actions.ts` porque módulo `'use server'` só exporta função
 * async — e porque a página e a ação PRECISAM do mesmo `where`: a ação de lote
 * reconstrói o filtro no servidor a partir de `q` e `f`, e se as duas cópias
 * divergissem, "aplicar a todos do filtro" agiria sobre um conjunto diferente
 * do que a tela mostrou.
 */
import type { Prisma } from '@insted/database';

export const FILTROS = [
  { chave: '', rotulo: 'Todas' },
  { chave: 'alunos-inativos', rotulo: 'Alunos inativos' },
  { chave: 'matricula-inativa', rotulo: 'Matrícula inativa' },
] as const;

export type ChaveFiltro = (typeof FILTROS)[number]['chave'];

/** Sufixo dos e-mails provisórios: quem tem um destes não recebe aviso. */
export const SEM_EMAIL = '@sem-email.insted.local';

export function lerFiltro(valor: unknown): ChaveFiltro {
  return FILTROS.some((f) => f.chave === valor) ? (valor as ChaveFiltro) : '';
}

export function montarWhere(q: string, f: ChaveFiltro): Prisma.EnrollmentWhereInput {
  const busca = q.trim();

  return {
    // Aluno apagado (soft delete) nunca aparece, qualquer que seja a aba.
    student: {
      deletadoEm: null,
      ...(f === 'alunos-inativos' ? { status: 'INATIVO' as const } : {}),
    },
    ...(f === 'matricula-inativa' ? { ativo: false } : {}),
    ...(busca
      ? {
          OR: [
            { student: { nome: { contains: busca, mode: 'insensitive' as const } } },
            { student: { matricula: { contains: busca, mode: 'insensitive' as const } } },
            { class: { nome: { contains: busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
}
