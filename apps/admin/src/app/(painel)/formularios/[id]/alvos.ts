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

/**
 * O rótulo certo para o PÚBLICO do formulário.
 *
 * O mesmo tipo de alvo significa coisas diferentes conforme quem responde:
 * `DISCIPLINA` é "disciplinas cursadas" para o aluno, que as tem pela matrícula,
 * e "disciplinas que leciona" para o docente, que as tem pelas alocações. Um
 * rótulo só mandava a CPA escolher "Disciplinas cursadas" para um professor —
 * e, pior, um bloco assim num formulário de docente era ignorado pelo gerador.
 */
export function rotuloDoAlvo(tipo: TargetType, publico: string): string {
  if (publico === 'PROFESSOR') {
    if (tipo === 'DISCIPLINA') return 'Disciplinas que leciona (um card por turma/disciplina dele)';
    if (tipo === 'PROFESSOR_DISCIPLINA') return 'Professores do respondente (só para alunos)';
  }
  return ROTULO_ALVO[tipo];
}

/** O selo do bloco repetível: "um card por quê", conforme quem responde. */
export function textoDoRepetido(tipo: TargetType, publico: string): string {
  if (publico === 'PROFESSOR') {
    switch (tipo) {
      case 'CURSO':
        return 'um card por curso em que atua';
      case 'TURMA':
        return 'um card por turma dele';
      case 'DISCIPLINA':
        return 'um card por turma/disciplina que leciona';
      case 'DEPARTAMENTO':
        return 'um card por setor';
      default:
        return 'um card por alvo';
    }
  }
  return tipo === 'DEPARTAMENTO' ? 'um card por setor' : 'um card por professor';
}
