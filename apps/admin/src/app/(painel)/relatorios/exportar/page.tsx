/**
 * Porta de entrada da exportação, pelo menu lateral.
 *
 * Os arquivos são por ciclo — é o ciclo que define o instrumento, o período e
 * o conjunto de respostas. Esta tela só escolhe qual. Com um ciclo só, ela
 * manda direto para ele: um clique a mais numa lista de um item é ruído.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const numero = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

export default async function Exportar() {
  await exigirPainel();

  const ciclos = await prisma.evaluationPeriod.findMany({
    orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
    select: {
      id: true,
      nome: true,
      ano: true,
      status: true,
      _count: { select: { respostas: true } },
    },
  });

  if (ciclos.length === 1) redirect(`/periodos/${ciclos[0].id}/resultados`);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 lg:px-8">
      <header>
        <h1 className="font-brand text-3xl font-bold tracking-tight text-brand-navy">Exportação</h1>
        <p className="mt-2 text-slate-500">
          Escolha o ciclo para baixar as respostas. Os arquivos não trazem quem respondeu.
        </p>
      </header>

      {ciclos.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-brand-navy/10 bg-white px-5 py-6 text-sm text-slate-500">
          Nenhum ciclo cadastrado ainda.{' '}
          <Link href="/periodos" className="font-semibold text-brand-teal">
            Criar o primeiro →
          </Link>
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {ciclos.map((c) => (
            <li key={c.id}>
              <Link
                href={`/periodos/${c.id}/resultados`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4 transition-colors hover:border-brand-teal/40"
              >
                <span className="min-w-0">
                  <span className="block font-brand text-sm font-bold text-brand-navy">
                    {c.nome}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    {c.ano} · ciclo {c.status.toLowerCase()}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                  {numero(c._count.respostas)} cards respondidos
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
