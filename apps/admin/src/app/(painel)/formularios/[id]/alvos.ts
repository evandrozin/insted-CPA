/**
 * Alvos de um bloco de perguntas.
 *
 * Fica fora de `actions.ts` porque um módulo `'use server'` só pode exportar
 * funções async — constantes exportadas de lá quebram o build.
 */
import type { TargetType } from '@insted/database';

/** Lista fechada: o valor que vem do formulário é validado contra ela. */
export const TIPOS_ALVO: TargetType[] = [
  'INSTITUICAO',
  'INFRAESTRUTURA',
  'DEPARTAMENTO',
  'COORDENACAO',
  'CURSO',
  'DISCIPLINA',
  'PROFESSOR_DISCIPLINA',
  'AUTOAVALIACAO',
];

/**
 * Alvos que existem em mais de uma instância por respondente e por isso podem
 * gerar um card cada. "A instituição" não repete — só existe uma.
 */
export const ALVOS_REPETIVEIS: TargetType[] = [
  'DEPARTAMENTO',
  'PROFESSOR_DISCIPLINA',
  'DISCIPLINA',
];

/** Rótulos para a interface — o enum é técnico demais para a tela. */
export const ROTULO_ALVO: Record<TargetType, string> = {
  INSTITUICAO: 'A instituição em geral',
  INFRAESTRUTURA: 'Infraestrutura',
  DEPARTAMENTO: 'Setores (biblioteca, secretaria…)',
  COORDENACAO: 'Coordenação de curso',
  CURSO: 'O curso do respondente',
  DISCIPLINA: 'Disciplinas cursadas',
  PROFESSOR_DISCIPLINA: 'Professores do respondente',
  AUTOAVALIACAO: 'O próprio respondente',
};
