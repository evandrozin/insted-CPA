import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';

export const dynamic = 'force-dynamic';

export default async function Turmas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, pagina, pular } = lerParams(await searchParams);
  const where = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { course: { nome: { contains: q, mode: 'insensitive' as const } } },
        ],
      }
    : {};

  const [total, turmas] = await Promise.all([
    prisma.schoolClass.count({ where }),
    prisma.schoolClass.findMany({
      where,
      orderBy: [{ course: { nome: 'asc' } }, { nome: 'asc' }],
      skip: pular,
      take: POR_PAGINA,
      include: {
        course: { select: { nome: true } },
        term: { select: { codigo: true } },
        _count: { select: { matriculas: true, alocacoes: true } },
      },
    }),
  ]);

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Turmas"
      descricao="Turmas ativas dos semestres importados. É pela turma que o aluno chega às disciplinas e aos professores que vai avaliar."
      buscaPlaceholder="Buscar turma ou curso…"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/turmas"
      colunas={[
        { titulo: 'Turma' },
        { titulo: 'Curso' },
        { titulo: 'Semestre', estreita: true },
        { titulo: 'Turno', estreita: true },
        { titulo: 'Alunos', numerica: true, estreita: true },
        { titulo: 'Ofertas', numerica: true, estreita: true },
      ]}
      linhas={turmas.map((t) => [
        <span className="font-medium">{t.nome}</span>,
        t.course.nome,
        <span className="font-mono text-xs text-slate-400">{t.term.codigo}</span>,
        <Etiqueta tom={t.turno === 'EAD' ? 'ok' : 'neutro'}>{t.turno.toLowerCase()}</Etiqueta>,
        t._count.matriculas,
        t._count.alocacoes,
      ])}
    />
  );
}
