import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';

export const dynamic = 'force-dynamic';

export default async function Matriculas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, pagina, pular } = lerParams(await searchParams);
  const where = {
    ativo: true,
    ...(q
      ? {
          OR: [
            { student: { nome: { contains: q, mode: 'insensitive' as const } } },
            { student: { matricula: { contains: q, mode: 'insensitive' as const } } },
            { class: { nome: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [total, matriculas] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      orderBy: [{ class: { nome: 'asc' } }, { student: { nome: 'asc' } }],
      skip: pular,
      take: POR_PAGINA,
      include: {
        student: {
          select: {
            nome: true,
            matricula: true,
            status: true,
            _count: { select: { inscricoesDisciplina: true } },
          },
        },
        class: {
          select: { nome: true, turno: true, course: { select: { nome: true } }, term: { select: { codigo: true } } },
        },
      },
    }),
  ]);

  return (
    <Lista
      eyebrow="Vínculos"
      titulo="Matrículas"
      descricao="Aluno × turma. A coluna de disciplinas mostra em quantas ofertas o aluno está inscrito — é o número de cards de professor que ele receberá."
      buscaPlaceholder="Buscar por aluno, RA ou turma…"
      q={q}
      pagina={pagina}
      total={total}
      href="/alocacoes/matriculas"
      colunas={[
        { titulo: 'RA', estreita: true },
        { titulo: 'Aluno' },
        { titulo: 'Turma' },
        { titulo: 'Curso' },
        { titulo: 'Semestre', estreita: true },
        { titulo: 'Disciplinas', numerica: true, estreita: true },
      ]}
      linhas={matriculas.map((m) => [
        <span className="font-mono text-xs text-slate-400">{m.student.matricula}</span>,
        <span className="font-medium">
          {m.student.nome}
          {m.student.status !== 'ATIVO' && (
            <span className="ml-2">
              <Etiqueta tom="apagado">{m.student.status.toLowerCase()}</Etiqueta>
            </span>
          )}
        </span>,
        <span className="text-slate-500">{m.class.nome}</span>,
        m.class.course.nome,
        <span className="font-mono text-xs text-slate-400">{m.class.term.codigo}</span>,
        m.student._count.inscricoesDisciplina,
      ])}
    />
  );
}
