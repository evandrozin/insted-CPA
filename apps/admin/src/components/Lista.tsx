/**
 * Página de listagem — busca, tabela e paginação.
 *
 * Existe para que as seis telas de cadastro não repitam a mesma mecânica seis
 * vezes. A busca e a página vivem na URL (`?q=` e `?p=`), então o estado é
 * compartilhável, sobrevive ao reload e funciona sem JavaScript.
 */
import Link from 'next/link';

export const POR_PAGINA = 25;

export type Coluna = {
  titulo: string;
  /** Alinhamento à direita para números. */
  numerica?: boolean;
  /** Não quebra linha — códigos, datas, contagens. */
  estreita?: boolean;
};

type Props = {
  eyebrow: string;
  titulo: string;
  descricao?: string;
  /** Texto do campo de busca. Omitir esconde a busca. */
  buscaPlaceholder?: string;
  q: string;
  pagina: number;
  total: number;
  /** Rota base para os links de paginação, ex.: "/cadastros/cursos". */
  href: string;
  colunas: Coluna[];
  /** Uma célula por coluna, na mesma ordem. */
  linhas: React.ReactNode[][];
  /** Mostrado quando não há nenhum registro (não é resultado de busca vazia). */
  vazio?: React.ReactNode;
  /** Conteúdo extra entre o cabeçalho e a tabela — filtros, avisos, ações. */
  children?: React.ReactNode;
};

export function Lista({
  eyebrow,
  titulo,
  descricao,
  buscaPlaceholder,
  q,
  pagina,
  total,
  href,
  colunas,
  linhas,
  vazio,
  children,
}: Props) {
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const primeiro = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
  const ultimo = Math.min(pagina * POR_PAGINA, total);
  const url = (p: number) => `${href}?${new URLSearchParams({ ...(q ? { q } : {}), p: String(p) })}`;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          {titulo}
        </h1>
        {descricao && <p className="mt-2 max-w-2xl text-slate-500">{descricao}</p>}
      </header>

      {children}

      {buscaPlaceholder && (
        <form className="mt-6 flex flex-wrap gap-2" action={href}>
          <input
            name="q"
            defaultValue={q}
            placeholder={buscaPlaceholder}
            className="min-w-64 flex-1 rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal"
          />
          <button className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover">
            Buscar
          </button>
          {q && (
            <Link
              href={href}
              className="rounded-lg border border-brand-navy/10 bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-teal/40"
            >
              Limpar
            </Link>
          )}
        </form>
      )}

      <p className="mt-4 text-xs text-slate-400 tabular-nums">
        {total === 0
          ? q
            ? `Nenhum resultado para "${q}".`
            : 'Nenhum registro.'
          : `${primeiro}–${ultimo} de ${total.toLocaleString('pt-BR')}`}
      </p>

      {total === 0 && !q && vazio ? (
        <div className="mt-4 rounded-2xl border border-dashed border-brand-navy/25 bg-white/60 px-5 py-8 text-center text-sm text-slate-500">
          {vazio}
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {colunas.map((c) => (
                  <th
                    key={c.titulo}
                    className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400 ${
                      c.numerica ? 'text-right' : 'text-left'
                    } ${c.estreita ? 'whitespace-nowrap' : ''}`}
                  >
                    {c.titulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-brand-light/50">
                  {linha.map((celula, j) => (
                    <td
                      key={j}
                      className={`px-4 py-2.5 align-top text-brand-navy ${
                        colunas[j]?.numerica ? 'text-right tabular-nums' : ''
                      } ${colunas[j]?.estreita ? 'whitespace-nowrap' : ''}`}
                    >
                      {celula}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="mt-4 flex items-center justify-between text-xs">
          {pagina > 1 ? (
            <Link href={url(pagina - 1)} className="font-semibold text-brand-teal hover:text-brand-teal-hover">
              ← anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-slate-400 tabular-nums">
            página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={url(pagina + 1)} className="font-semibold text-brand-teal hover:text-brand-teal-hover">
              próxima →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

/** Etiqueta pequena para status, modalidade, papel. */
export function Etiqueta({
  children,
  tom = 'neutro',
}: {
  children: React.ReactNode;
  tom?: 'neutro' | 'ok' | 'alerta' | 'apagado';
}) {
  const tons = {
    neutro: 'bg-slate-100 text-slate-500',
    ok: 'bg-brand-teal/10 text-brand-teal-hover',
    alerta: 'bg-brand-orange/10 text-brand-orange',
    apagado: 'bg-slate-50 text-slate-400',
  };
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${tons[tom]}`}
    >
      {children}
    </span>
  );
}

/** Lê `?q=` e `?p=` com valores seguros. */
export function lerParams(sp: Record<string, string | string[] | undefined>) {
  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const p = Math.max(1, Number(typeof sp.p === 'string' ? sp.p : 1) || 1);
  return { q, pagina: p, pular: (p - 1) * POR_PAGINA };
}
