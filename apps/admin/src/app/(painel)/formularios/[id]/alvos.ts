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
  'TURMA',
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
  // Para o docente: um card por curso em que ele atua e um por turma dele.
  // Para o aluno, estes dois não repetem — ele tem um curso e uma turma.
  'CURSO',
  'TURMA',
];

/** Rótulos para a interface — o enum é técnico demais para a tela. */
export const ROTULO_ALVO: Record<TargetType, string> = {
  INSTITUICAO: 'A instituição em geral',
  INFRAESTRUTURA: 'Infraestrutura',
  DEPARTAMENTO: 'Setores (biblioteca, secretaria…)',
  COORDENACAO: 'Coordenação de curso',
  CURSO: 'Curso (do aluno; ou cada curso em que o docente atua)',
  DISCIPLINA: 'Disciplinas cursadas',
  TURMA: 'Turmas do docente',
  PROFESSOR_DISCIPLINA: 'Professores do respondente',
  AUTOAVALIACAO: 'O próprio respondente',
};
