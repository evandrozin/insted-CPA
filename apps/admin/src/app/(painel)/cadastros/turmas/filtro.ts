/**
 * Filtro da tela de turmas, compartilhado entre a página e as ações.
 *
 * Fora de `actions.ts` porque módulo `'use server'` só exporta função async — e
 * porque a ação de lote reconstrói o filtro no servidor a partir de `q` e `f`:
 * se as duas cópias divergissem, "desativar as N do filtro" agiria sobre um
 * conjunto diferente do que a tela mostrou.
 */
import type { Prisma } from '@insted/database';

export const FILTROS = [
  { chave: '', rotulo: 'Todas' },
  { chave: 'ativas', rotulo: 'Ativas' },
  { chave: 'inativas', rotulo: 'Inativas' },
] as const;

export type ChaveFiltro = (typeof FILTROS)[number]['chave'];

export function lerFiltro(valor: unknown): ChaveFiltro {
  return FILTROS.some((f) => f.chave === valor) ? (valor as ChaveFiltro) : '';
}

export function montarWhere(q: string, f: ChaveFiltro): Prisma.SchoolClassWhereInput {
  const busca = q.trim();

  return {
    ...(f === 'ativas' ? { ativo: true } : {}),
    ...(f === 'inativas' ? { ativo: false } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: 'insensitive' as const } },
            { course: { nome: { contains: busca, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };
}
