/**
 * Agregação dos resultados de um ciclo.
 *
 * SQL direto, não Prisma: são agrupamentos com média, contagem e distribuição
 * sobre centenas de milhares de linhas, e trazer isso para a memória do Node
 * para somar em JavaScript seria lento e frágil. O banco faz isso bem.
 *
 * Duas regras atravessam tudo aqui:
 *
 * 1. **Peso 0 não entra na média.** É como o sistema marca pergunta
 *    informativa — curso, turma, caracterização. Somá-las produziria um
 *    número sem significado.
 *
 * 2. **Alvo com poucas respostas não aparece.** O ciclo guarda o mínimo em
 *    `minimoRespostasExibicao` (padrão 5). Um professor avaliado por duas
 *    pessoas, numa turma de dois alunos, é identificável — a média seria a
 *    opinião de alguém com nome e sobrenome.
 *
 * Só respostas numéricas (escala e 0 a 10) entram em média. Escolha única e
 * múltipla não têm valor numérico: viram contagem por alternativa.
 */
import { prisma } from '@insted/database';
import { Prisma } from '@insted/database';

export type MediaPorBloco = {
  blockId: string;
  titulo: string;
  ordem: number;
  media: number | null;
  respostas: number;
  conjuntos: number;
};

export type EstatisticaDaPergunta = {
  questionId: string;
  blockId: string;
  enunciado: string;
  tipo: string;
  ordem: number;
  blocoOrdem: number;
  peso: number;
  media: number | null;
  respostas: number;
  naoSeAplica: number;
  /** { "1": 3, "2": 10 } — só para escala e 0 a 10. */
  distribuicao: Record<string, number>;
  /** Contagem por alternativa — só para escolha única e múltipla. */
  alternativas: { rotulo: string; total: number }[];
};

export type MediaPorAlvo = {
  refId: string;
  nome: string;
  detalhe: string | null;
  media: number | null;
  respostas: number;
  respondentes: number;
  /** Abaixo do mínimo do ciclo: existe, mas não pode ser exibido. */
  suprimido: boolean;
};

/** Respostas que entram em média: numéricas, com peso, e não "não se aplica". */
const NUMERICAS = Prisma.sql`
  a."valorNumerico" IS NOT NULL
  AND a."naoSeAplica" = false
  AND q.peso > 0
`;

export async function mediasPorBloco(periodId: string): Promise<MediaPorBloco[]> {
  return prisma.$queryRaw<MediaPorBloco[]>`
    SELECT b.id                                   AS "blockId",
           b.titulo                               AS titulo,
           b.ordem                                AS ordem,
           ROUND(AVG(a."valorNumerico") FILTER (WHERE ${NUMERICAS})::numeric, 2)::float8 AS media,
           COUNT(a.id) FILTER (WHERE ${NUMERICAS})::int AS respostas,
           COUNT(DISTINCT rs.id)::int             AS conjuntos
      FROM response_sets rs
      JOIN question_blocks b ON b.id = rs."blockId"
      JOIN answers a         ON a."responseSetId" = rs.id
      JOIN questions q       ON q.id = a."questionId"
     WHERE rs."periodId" = ${periodId}
     GROUP BY b.id, b.titulo, b.ordem
     ORDER BY b.ordem
  `;
}

export async function estatisticasPorPergunta(
  periodId: string,
): Promise<EstatisticaDaPergunta[]> {
  const base = await prisma.$queryRaw<
    Omit<EstatisticaDaPergunta, 'distribuicao' | 'alternativas'>[]
  >`
    SELECT q.id                                   AS "questionId",
           b.id                                   AS "blockId",
           q.enunciado                            AS enunciado,
           q.tipo::text                           AS tipo,
           q.ordem                                AS ordem,
           b.ordem                                AS "blocoOrdem",
           q.peso::float8                         AS peso,
           ROUND(AVG(a."valorNumerico") FILTER (WHERE ${NUMERICAS})::numeric, 2)::float8 AS media,
           COUNT(a.id) FILTER (WHERE a."naoSeAplica" = false)::int AS respostas,
           COUNT(a.id) FILTER (WHERE a."naoSeAplica" = true)::int  AS "naoSeAplica"
      FROM answers a
      JOIN response_sets rs ON rs.id = a."responseSetId"
      JOIN questions q      ON q.id = a."questionId"
      JOIN question_blocks b ON b.id = q."blockId"
     WHERE rs."periodId" = ${periodId}
     GROUP BY q.id, b.id, q.enunciado, q.tipo, q.ordem, b.ordem, q.peso
     ORDER BY b.ordem, q.ordem
  `;

  const [distribuicoes, alternativas] = await Promise.all([
    prisma.$queryRaw<{ questionId: string; valor: number; total: number }[]>`
      SELECT a."questionId" AS "questionId",
             a."valorNumerico" AS valor,
             COUNT(*)::int     AS total
        FROM answers a
        JOIN response_sets rs ON rs.id = a."responseSetId"
       WHERE rs."periodId" = ${periodId}
         AND a."valorNumerico" IS NOT NULL
       GROUP BY a."questionId", a."valorNumerico"
    `,
    prisma.$queryRaw<{ questionId: string; rotulo: string; total: number }[]>`
      SELECT a."questionId" AS "questionId",
             o.rotulo        AS rotulo,
             COUNT(*)::int   AS total
        FROM answer_options ao
        JOIN answers a         ON a.id = ao."answerId"
        JOIN response_sets rs  ON rs.id = a."responseSetId"
        JOIN question_options o ON o.id = ao."optionId"
       WHERE rs."periodId" = ${periodId}
       GROUP BY a."questionId", o.rotulo, o.ordem
       ORDER BY o.ordem
    `,
  ]);

  return base.map((q) => ({
    ...q,
    distribuicao: Object.fromEntries(
      distribuicoes
        .filter((d) => d.questionId === q.questionId)
        .map((d) => [String(d.valor), d.total]),
    ),
    alternativas: alternativas
      .filter((a) => a.questionId === q.questionId)
      .map((a) => ({ rotulo: a.rotulo, total: a.total })),
  }));
}

/**
 * Média por professor avaliado.
 *
 * `respondentes` conta conjuntos de resposta, não respostas: um professor
 * avaliado por 3 pessoas em 11 itens tem 33 respostas e 3 respondentes — e é o
 * 3 que decide se pode aparecer.
 */
export async function mediasPorProfessor(
  periodId: string,
  minimo: number,
): Promise<MediaPorAlvo[]> {
  const linhas = await prisma.$queryRaw<Omit<MediaPorAlvo, 'suprimido'>[]>`
    SELECT rs."teacherId"                         AS "refId",
           u.nome                                 AS nome,
           NULL::text                             AS detalhe,
           ROUND(AVG(a."valorNumerico") FILTER (WHERE ${NUMERICAS})::numeric, 2)::float8 AS media,
           COUNT(a.id) FILTER (WHERE ${NUMERICAS})::int AS respostas,
           COUNT(DISTINCT rs.id)::int             AS respondentes
      FROM response_sets rs
      JOIN users u     ON u.id = rs."teacherId"
      JOIN answers a   ON a."responseSetId" = rs.id
      JOIN questions q ON q.id = a."questionId"
     WHERE rs."periodId" = ${periodId}
       AND rs."teacherId" IS NOT NULL
     GROUP BY rs."teacherId", u.nome
     ORDER BY u.nome
  `;

  return linhas.map((l) => ({ ...l, suprimido: l.respondentes < minimo }));
}

/** Média por curso de quem respondeu — o recorte que a CPA mais usa. */
export async function mediasPorCurso(
  periodId: string,
  minimo: number,
): Promise<MediaPorAlvo[]> {
  const linhas = await prisma.$queryRaw<Omit<MediaPorAlvo, 'suprimido'>[]>`
    SELECT c.id                                   AS "refId",
           c.nome                                 AS nome,
           -- codigo, e não uma sigla: é o identificador curto que vem do
           -- JACAD e o que a coordenação reconhece nas listas.
           c.codigo                               AS detalhe,
           ROUND(AVG(a."valorNumerico") FILTER (WHERE ${NUMERICAS})::numeric, 2)::float8 AS media,
           COUNT(a.id) FILTER (WHERE ${NUMERICAS})::int AS respostas,
           COUNT(DISTINCT rs.id)::int             AS respondentes
      FROM response_sets rs
      JOIN courses c   ON c.id = rs."respondentCourseId"
      JOIN answers a   ON a."responseSetId" = rs.id
      JOIN questions q ON q.id = a."questionId"
     WHERE rs."periodId" = ${periodId}
     GROUP BY c.id, c.nome, c.codigo
     ORDER BY c.nome
  `;

  return linhas.map((l) => ({ ...l, suprimido: l.respondentes < minimo }));
}
