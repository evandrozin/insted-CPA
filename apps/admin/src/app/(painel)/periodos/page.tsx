/**
 * Ciclos de avaliação, agrupados por ano.
 *
 * A CPA avalia uma vez por ano, então a lista é a própria série histórica: os
 * anos anteriores ficam visíveis e consultáveis, nunca são apagados.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';
import { criarCiclo } from './actions';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  RASCUNHO: { rotulo: 'rascunho', classe: 'bg-slate-100 text-slate-500' },
  AGENDADO: { rotulo: 'agendado', classe: 'bg-brand-blue/10 text-brand-blue' },
  ABERTO: { rotulo: 'aberto', classe: 'bg-brand-teal/10 text-brand-teal-hover' },
  ENCERRADO: { rotulo: 'encerrado', classe: 'bg-brand-orange/10 text-brand-orange' },
  PUBLICADO: { rotulo: 'resultados publicados', classe: 'bg-brand-navy/10 text-brand-navy' },
};

const data = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);

export default async function Periodos() {
  let ciclos: Awaited<ReturnType<typeof carregar>> = [];
  let anosDisponiveis: number[] = [];
  let erro = false;

  try {
    ciclos = await carregar();
    const terms = await prisma.academicTerm.findMany({ select: { ano: true }, distinct: ['ano'] });
    anosDisponiveis = [...new Set(terms.map((t) => t.ano))].sort((a, b) => b - a);
  } catch {
    erro = true;
  }

  // Agrupa por ano — o eixo do ciclo e da série histórica.
  const porAno = new Map<number, typeof ciclos>();
  for (const c of ciclos) {
    if (!porAno.has(c.ano)) porAno.set(c.ano, []);
    porAno.get(c.ano)!.push(c);
  }
  const anos = [...porAno.keys()].sort((a, b) => b - a);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Avaliação
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Ciclos de avaliação
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Um ciclo por ano, cobrindo os semestres letivos daquele ano. Ciclos encerrados ficam
          preservados como série histórica — é deles que sai a comparação entre anos.
        </p>
      </header>

      {erro && (
        <p className="mt-6 rounded-lg border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600">
          Banco indisponível. Suba a infraestrutura com{' '}
          <code className="font-mono text-xs text-brand-navy">npm run infra:up</code>.
        </p>
      )}

      {/* ------------------------------------------------------- novo ciclo */}
      {!erro && (
        <form className="mt-8 rounded-2xl border border-dashed border-brand-navy/25 bg-white/60 px-5 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-xs text-slate-500">
              Ano do ciclo
              <select
                name="ano"
                defaultValue={anosDisponiveis[0]}
                className="mt-1 block rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy"
              >
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-56 flex-1 text-xs text-slate-500">
              Nome (opcional)
              <input
                name="nome"
                placeholder="Avaliação Institucional 2026"
                className="mt-1 block w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy"
              />
            </label>
            <button
              formAction={criarCiclo}
              className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
            >
              Criar ciclo
            </button>
          </div>
          {anosDisponiveis.length === 0 && !erro && (
            <p className="mt-2 text-xs text-brand-orange">
              Nenhum semestre letivo importado. Importe do JACAD antes de criar um ciclo.
            </p>
          )}
        </form>
      )}

      {/* --------------------------------------------------------- histórico */}
      {anos.length === 0 && !erro && (
        <p className="mt-6 text-sm text-slate-500">Nenhum ciclo cadastrado ainda.</p>
      )}

      {anos.map((ano) => (
        <section key={ano} className="mt-10">
          <div className="flex items-baseline gap-3 border-b border-brand-navy/10 pb-2">
            <h2 className="font-brand text-2xl font-bold tracking-tight text-brand-navy tabular-nums">
              {ano}
            </h2>
            <span className="text-xs text-slate-400">
              {porAno.get(ano)!.length} {porAno.get(ano)!.length === 1 ? 'ciclo' : 'ciclos'}
            </span>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {porAno.get(ano)!.map((c) => {
              const st = STATUS[c.status] ?? STATUS.RASCUNHO;
              const semestres =
                c.semestres.length > 0
                  ? c.semestres.map((s) => s.term.codigo).join(' + ')
                  : c.term.codigo;

              return (
                <li key={c.id}>
                  <Link
                    href={`/periodos/${c.id}`}
                    className="block rounded-2xl border border-brand-navy/10 bg-white px-5 py-4 transition-colors hover:border-brand-teal/40"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${st.classe}`}
                          >
                            {st.rotulo}
                          </span>
                          <span className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                            semestres {semestres}
                          </span>
                        </div>
                        <p className="mt-1.5 font-brand text-base font-semibold text-brand-navy">
                          {c.nome}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          {data(c.abreEm)} — {data(c.fechaEm)} ·{' '}
                          {c.formularios.length || 'nenhum'}{' '}
                          {c.formularios.length === 1 ? 'formulário' : 'formulários'}
                        </p>
                      </div>

                      <div className="flex shrink-0 gap-6 text-right">
                        <div>
                          <p className="text-lg font-semibold text-brand-navy tabular-nums">
                            {c._count.tarefas.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                            respondentes
                          </p>
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-brand-navy tabular-nums">
                            {c.concluidas.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                            responderam
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

async function carregar() {
  const ciclos = await prisma.evaluationPeriod.findMany({
    orderBy: [{ ano: 'desc' }, { abreEm: 'desc' }],
    include: {
      term: true,
      semestres: { include: { term: true }, orderBy: { term: { semestre: 'asc' } } },
      formularios: true,
      _count: { select: { tarefas: true } },
    },
  });

  // Adesão por ciclo, em uma consulta só.
  const concluidas = await prisma.evaluationTask.groupBy({
    by: ['periodId'],
    where: { status: 'CONCLUIDA' },
    _count: true,
  });
  const mapa = new Map(concluidas.map((c) => [c.periodId, c._count]));

  return ciclos.map((c) => ({ ...c, concluidas: mapa.get(c.id) ?? 0 }));
}
