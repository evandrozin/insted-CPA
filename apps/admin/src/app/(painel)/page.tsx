const entregasFase1 = [
  { item: 'Monorepo, Docker Compose e CI', feito: true },
  { item: 'Schema Prisma, migração inicial e seed', feito: true },
  { item: 'Shell do painel administrativo', feito: true },
  { item: 'Identidade visual institucional', feito: true },
  { item: 'Autenticação (JWT + refresh rotativo)', feito: false },
  { item: 'RBAC (RolesGuard + ScopeGuard)', feito: false },
  { item: 'CRUD acadêmico', feito: false },
  { item: 'Importação CSV/XLSX com dry-run', feito: false },
  { item: 'Matrículas e alocações docentes', feito: false },
];

const concluidas = entregasFase1.filter((e) => e.feito).length;
const progresso = Math.round((concluidas / entregasFase1.length) * 100);

const indicadores = [
  { rotulo: 'Período ativo', valor: 'nenhum' },
  { rotulo: 'Respostas recebidas', valor: '—' },
  { rotulo: 'Adesão', valor: '—' },
];

export default function Painel() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Ambiente de desenvolvimento
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Painel da CPA
        </h1>
        <p className="mt-2 max-w-xl text-slate-500">
          A estrutura do projeto está de pé. As telas de cadastro e relatório entram conforme as
          fases do roadmap — a barra lateral marca cada uma com a fase em que chega.
        </p>
      </header>

      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        {indicadores.map((tile) => (
          <div
            key={tile.rotulo}
            className="rounded-2xl border border-brand-navy/10 bg-white px-5 py-4"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              {tile.rotulo}
            </p>
            <p className="mt-1.5 text-xl font-semibold text-slate-400 tabular-nums">{tile.valor}</p>
          </div>
        ))}
      </section>

      <p className="mt-3 text-sm text-slate-400">
        Sem números porque a API ainda não existe — este painel não lê o banco. Os valores aparecem
        quando o módulo de autenticação e os endpoints da Fase 1 entrarem.
      </p>

      <section className="relative mt-10 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
        <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />

        <div className="px-6 pb-2 pt-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
              Fase 1 — Fundação e cadastros
            </h2>
            <span className="text-xs font-semibold text-slate-400 tabular-nums">
              {concluidas}/{entregasFase1.length}
            </span>
          </div>

          <div
            className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da Fase 1"
          >
            <div className="h-full rounded-full bg-brand-teal" style={{ width: `${progresso}%` }} />
          </div>
        </div>

        <ul className="flex flex-col px-6 pb-5 pt-3">
          {entregasFase1.map((entrega) => (
            <li
              key={entrega.item}
              className="flex items-center gap-3 border-b border-slate-100 py-2.5 text-sm last:border-0"
            >
              <span
                aria-hidden
                className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${
                  entrega.feito ? 'bg-brand-teal' : 'bg-slate-300'
                }`}
              />
              <span className={entrega.feito ? 'text-brand-navy' : 'text-slate-400'}>
                {entrega.item}
              </span>
              <span
                className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${
                  entrega.feito ? 'bg-brand-teal/10 text-brand-teal-hover' : 'bg-slate-100 text-slate-400'
                }`}
              >
                {entrega.feito ? 'pronto' : 'pendente'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-orange">
          Antes de seguir para a Fase 2
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Suba o banco e rode a migração e o seed para conferir o modelo de dados com dados reais:{' '}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs text-brand-navy">
            npm run infra:up &amp;&amp; npm run db:migrate &amp;&amp; npm run db:seed
          </code>
        </p>
      </section>
    </div>
  );
}
