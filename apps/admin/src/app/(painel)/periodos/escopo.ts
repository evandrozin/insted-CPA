/**
 * Recorte de uma geração de tarefas, a partir do que a tela envia.
 *
 * Fica fora de `actions.ts` — módulo `'use server'` só exporta função async —
 * e porque a ação (que gera) e a página (que conta antes) PRECISAM da mesma
 * tradução. Se divergissem, a prévia diria 572 e a geração criaria outro número.
 */
import type { EscopoGeracao } from '@insted/avaliacao';

export type EntradaDoEscopo = {
  /** Ids de PeriodForm marcados. */
  formularios: string[];
  /** "PRESENCIAL" e/ou "EAD", como a tela envia. */
  modalidades: string[];
  /** Ids de curso marcados. */
  cursos: string[];
};

/**
 * Presencial inclui o semipresencial: na prática o aluno "é presencial" quando
 * tem aula na sala, e separar os dois pediria à CPA uma distinção que o
 * questionário não faz.
 */
export function montarEscopo(e: EntradaDoEscopo): EscopoGeracao {
  return {
    formularios: e.formularios.filter(Boolean),
    cursos: e.cursos.filter(Boolean),
    modalidades: [
      ...(e.modalidades.includes('PRESENCIAL') ? (['PRESENCIAL', 'SEMIPRESENCIAL'] as const) : []),
      ...(e.modalidades.includes('EAD') ? (['EAD'] as const) : []),
    ],
  };
}

/** Normaliza um parâmetro de URL que pode vir ausente, único ou repetido. */
export function lista(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  return v ? [v] : [];
}
