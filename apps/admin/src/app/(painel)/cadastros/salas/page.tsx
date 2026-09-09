import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';

export const dynamic = 'force-dynamic';

export default async function Salas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { q, pagina, pular } = lerParams(await searchParams);
  const where = q ? { nome: { contains: q, mode: 'insensitive' as const } } : {};

  const [total, salas] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({
      where,
      orderBy: { nome: 'asc' },
      skip: pular,
      take: POR_PAGINA,
      include: { campus: { select: { nome: true } }, _count: { select: { alocacoes: true } } },
    }),
  ]);

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Salas"
      descricao="Espaços físicos vinculados às alocações."
      buscaPlaceholder={total > 0 ? 'Buscar sala…' : undefined}
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/salas"
      colunas={[
        { titulo: 'Sala' },
        { titulo: 'Bloco', estreita: true },
        { titulo: 'Tipo', estreita: true },
        { titulo: 'Capacidade', numerica: true, estreita: true },
        { titulo: 'Alocações', numerica: true, estreita: true },
      ]}
      linhas={salas.map((s) => [
        <span className="font-medium">{s.nome}</span>,
        s.bloco ?? <span className="text-slate-300">—</span>,
        s.tipo ?? <span className="text-slate-300">—</span>,
        s.capacidade ?? <span className="text-slate-300">—</span>,
        s._count.alocacoes,
      ])}
      vazio={
        <>
          <p className="font-medium text-brand-navy">Nenhuma sala cadastrada.</p>
          <p className="mt-2">
            A importação do JACAD traz a sala dentro da alocação docente, mas o endpoint de salas
            ainda não é consumido. Enquanto isso, o campo fica vazio — ele não afeta a geração da
            avaliação.
          </p>
        </>
      }
    />
  );
}
