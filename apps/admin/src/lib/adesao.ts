/**
 * Acompanhamento da adesão de um ciclo aberto.
 *
 * Diferente do relatório: aqui a pergunta não é "o que responderam", é "quem
 * ainda falta". São tabelas diferentes — tarefa, não resposta — e é por isso
 * que esta tela pode nomear curso e turma sem ferir o anonimato: ela fala de
 * quem recebeu a avaliação, nunca do que foi respondido.
 *
 * Quem foi retirado do ciclo (DISPENSADA) não conta em nenhuma das consultas
 * daqui: ele saiu do denominador, e a adesão é a de quem de fato foi convidado.
 *
 * Cada aluno entra uma vez só. Quem tem dois vínculos ativos — troca de curso,
 * segunda graduação — apareceria duas vezes num JOIN direto, e a soma dos
 * cursos não bateria com o total do ciclo. O recorte usa a matrícula ativa
 * mais recente, o mesmo critério que o envio da resposta usa para carimbar
 * curso e turma.
 */
import { prisma } from '@insted/database';

export type FatiaDeAdesao = {
  rotulo: string;
  detalhe: string | null;
  tarefas: number;
  concluidas: number;
  emAndamento: number;
};

export type ResumoDeAdesao = {
  tarefas: number;
  concluidas: number;
  emAndamento: number;
  pendentes: number;
  percentual: number;
};

export async function resumoDeAdesao(periodId: string): Promise<ResumoDeAdesao> {
  const [linha] = await prisma.$queryRaw<
    { tarefas: number; concluidas: number; emAndamento: number }[]
  >`
    SELECT COUNT(*)::int                                              AS tarefas,
           COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA')::int        AS concluidas,
           COUNT(*) FILTER (WHERE t.status = 'EM_ANDAMENTO')::int     AS "emAndamento"
      FROM evaluation_tasks t
     WHERE t."periodId" = ${periodId} AND t.status <> 'DISPENSADA'
  `;

  const tarefas = linha?.tarefas ?? 0;
  const concluidas = linha?.concluidas ?? 0;
  const emAndamento = linha?.emAndamento ?? 0;

  return {
    tarefas,
    concluidas,
    emAndamento,
    pendentes: tarefas - concluidas - emAndamento,
    percentual: tarefas > 0 ? Math.round((concluidas / tarefas) * 100) : 0,
  };
}

/** Adesão por curso do respondente. Quem não tem matrícula fica fora. */
export async function adesaoPorCurso(periodId: string): Promise<FatiaDeAdesao[]> {
  return prisma.$queryRaw<FatiaDeAdesao[]>`
    SELECT c.nome                                                     AS rotulo,
           c.codigo                                                   AS detalhe,
           COUNT(*)::int                                              AS tarefas,
           COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA')::int        AS concluidas,
           COUNT(*) FILTER (WHERE t.status = 'EM_ANDAMENTO')::int     AS "emAndamento"
      FROM evaluation_tasks t
      JOIN LATERAL (
        SELECT sc."courseId"
          FROM enrollments e
          JOIN school_classes sc ON sc.id = e."classId"
         WHERE e."studentId" = t."respondentId" AND e.ativo = true
         ORDER BY e."criadoEm" DESC
         LIMIT 1
      ) m ON true
      JOIN courses c ON c.id = m."courseId"
     WHERE t."periodId" = ${periodId} AND t.status <> 'DISPENSADA'
     GROUP BY c.nome, c.codigo
     ORDER BY (COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA'))::float8 / COUNT(*) ASC, c.nome
  `;
}

/**
 * Adesão por turma, das piores para as melhores.
 *
 * Ordenado por percentual crescente porque a lista existe para a cobrança: o
 * que interessa é a turma onde ninguém respondeu, não a que já terminou.
 */
export async function adesaoPorTurma(periodId: string, limite = 30): Promise<FatiaDeAdesao[]> {
  return prisma.$queryRaw<FatiaDeAdesao[]>`
    SELECT sc.nome                                                    AS rotulo,
           c.nome                                                     AS detalhe,
           COUNT(*)::int                                              AS tarefas,
           COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA')::int        AS concluidas,
           COUNT(*) FILTER (WHERE t.status = 'EM_ANDAMENTO')::int     AS "emAndamento"
      FROM evaluation_tasks t
      JOIN LATERAL (
        SELECT e."classId"
          FROM enrollments e
         WHERE e."studentId" = t."respondentId" AND e.ativo = true
         ORDER BY e."criadoEm" DESC
         LIMIT 1
      ) m ON true
      JOIN school_classes sc ON sc.id = m."classId"
      JOIN courses c         ON c.id = sc."courseId"
     WHERE t."periodId" = ${periodId} AND t.status <> 'DISPENSADA'
     GROUP BY sc.nome, c.nome
     ORDER BY (COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA'))::float8 / COUNT(*) ASC, sc.nome
     LIMIT ${limite}
  `;
}

/** Adesão por perfil — aluno, docente, técnico. */
export async function adesaoPorPerfil(periodId: string): Promise<FatiaDeAdesao[]> {
  return prisma.$queryRaw<FatiaDeAdesao[]>`
    SELECT u.role::text                                               AS rotulo,
           NULL::text                                                 AS detalhe,
           COUNT(*)::int                                              AS tarefas,
           COUNT(*) FILTER (WHERE t.status = 'CONCLUIDA')::int        AS concluidas,
           COUNT(*) FILTER (WHERE t.status = 'EM_ANDAMENTO')::int     AS "emAndamento"
      FROM evaluation_tasks t
      JOIN users u ON u.id = t."respondentId"
     WHERE t."periodId" = ${periodId} AND t.status <> 'DISPENSADA'
     GROUP BY u.role
     ORDER BY COUNT(*) DESC
  `;
}

/** Envios por dia, para ver o efeito de um aviso. */
export async function enviosPorDia(
  periodId: string,
): Promise<{ dia: Date; total: number }[]> {
  return prisma.$queryRaw<{ dia: Date; total: number }[]>`
    SELECT DATE_TRUNC('day', t."concluidaEm") AS dia,
           COUNT(*)::int                      AS total
      FROM evaluation_tasks t
     WHERE t."periodId" = ${periodId} AND t.status <> 'DISPENSADA'
       AND t."concluidaEm" IS NOT NULL
     GROUP BY 1
     ORDER BY 1
  `;
}
