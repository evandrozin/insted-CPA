import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { alternarCursoAtivo } from '../actions';

export const dynamic = 'force-dynamic';

export default async function Cursos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const volta = `/cadastros/cursos?${new URLSearchParams({ ...(q ? { q } : {}), p: String(pagina) })}`;

  const where = q
    ? {
        OR: [
          { nome: { contains: q, mode: 'insensitive' as const } },
          { codigo: { contains: q, mode: 'insensitive' as const } },
        ],
      }
    : {};

  const [total, cursos, inativos] = await Promise.all([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy: { nome: 'asc' },
      skip: pular,
      take: POR_PAGINA,
      include: { _count: { select: { turmas: true, disciplinas: true } } },
    }),
    prisma.course.count({ where: { ativo: false } }),
  ]);

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Cursos"
      descricao="Curso inativo sai da avaliação: seus alunos não recebem tarefa e suas disciplinas não geram cards. Use para modalidades ou cursos que não participam do ciclo."
      buscaPlaceholder="Buscar por nome ou código…"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/cursos"
      colunas={[
        { titulo: 'Código', estreita: true },
        { titulo: 'Curso' },
        { titulo: 'Modalidade', estreita: true },
        { titulo: 'Turmas', numerica: true, estreita: true },
        { titulo: 'Discipl.', numerica: true, estreita: true },
        { titulo: 'Na avaliação', estreita: true },
      ]}
      linhas={cursos.map((c) => [
        <span className="font-mono text-xs text-slate-400">{c.codigo}</span>,
        <span className={c.ativo ? 'font-medium' : 'font-medium text-slate-400 line-through'}>
          {c.nome}
        </span>,
        c.modalidade ? (
          <Etiqueta tom={c.modalidade.toUpperCase() === 'EAD' ? 'ok' : 'neutro'}>
            {c.modalidade}
          </Etiqueta>
        ) : (
          <Etiqueta tom="alerta">não informada</Etiqueta>
        ),
        c._count.turmas,
        c._count.disciplinas,
        <form>
          <input type="hidden" name="volta" value={volta} />
          <button
            formAction={alternarCursoAtivo.bind(null, c.id)}
            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              c.ativo
                ? 'border-brand-teal/40 bg-brand-teal/10 text-brand-teal-hover hover:border-brand-orange/50 hover:bg-brand-orange/10 hover:text-brand-orange'
                : 'border-brand-navy/10 bg-white text-slate-400 hover:border-brand-teal/40 hover:text-brand-teal-hover'
            }`}
            title={c.ativo ? 'Remover do ciclo de avaliação' : 'Incluir no ciclo de avaliação'}
          >
            {c.ativo ? 'incluído' : 'fora'}
          </button>
        </form>,
      ])}
    >
      {inativos > 0 && (
        <p className="mt-6 rounded-lg border border-brand-orange/30 bg-brand-orange/5 px-4 py-2.5 text-xs text-slate-600">
          <strong>{inativos}</strong> {inativos === 1 ? 'curso está fora' : 'cursos estão fora'} do
          ciclo. Gere as tarefas de novo para a mudança valer no ciclo em rascunho.
        </p>
      )}
    </Lista>
  );
}
