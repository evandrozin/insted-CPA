import Link from 'next/link';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { alternarDisciplinaAtiva, definirModalidade } from '../actions';

export const dynamic = 'force-dynamic';

const OPCOES = [
  { valor: 'NAO_INFORMADA', rotulo: '— sem definir —' },
  { valor: 'PRESENCIAL', rotulo: 'Presencial' },
  { valor: 'EAD', rotulo: 'EAD' },
  { valor: 'SEMIPRESENCIAL', rotulo: 'Semipresencial' },
];

export default async function Disciplinas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const soPendentes = sp.pendentes === '1';
  const volta = `/cadastros/disciplinas?${new URLSearchParams({
    ...(q ? { q } : {}),
    ...(soPendentes ? { pendentes: '1' } : {}),
    p: String(pagina),
  })}`;

  const where = {
    ...(q ? { nome: { contains: q, mode: 'insensitive' as const } } : {}),
    // "Pendente" é a disciplina que tem ao menos uma oferta sem modalidade —
    // são elas que deixam o aluno sem receber as perguntas do bloco filtrado.
    ...(soPendentes ? { alocacoes: { some: { modalidade: 'NAO_INFORMADA' as const } } } : {}),
  };

  const [total, disciplinas, pendentes] = await Promise.all([
    prisma.subject.count({ where }),
    prisma.subject.findMany({
      where,
      orderBy: { nome: 'asc' },
      skip: pular,
      take: POR_PAGINA,
      include: {
        course: { select: { nome: true } },
        alocacoes: { select: { modalidade: true } },
      },
    }),
    prisma.subject.count({ where: { alocacoes: { some: { modalidade: 'NAO_INFORMADA' } } } }),
  ]);

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Disciplinas"
      descricao="A modalidade real vive na oferta de cada semestre. O que se define aqui é o padrão para quando o JACAD não informa — e ele é aplicado na hora às ofertas que estão sem."
      buscaPlaceholder="Buscar disciplina…"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/disciplinas"
      colunas={[
        { titulo: 'Disciplina' },
        { titulo: 'Curso' },
        { titulo: 'Ofertas', numerica: true, estreita: true },
        { titulo: 'Modalidades', estreita: true },
        { titulo: 'Definir modalidade', estreita: true },
        { titulo: 'Na avaliação', estreita: true },
      ]}
      linhas={disciplinas.map((d) => {
        const mods = [...new Set(d.alocacoes.map((a) => a.modalidade))];
        const temPendente = mods.includes('NAO_INFORMADA');

        return [
          <span className={d.ativo ? 'font-medium' : 'font-medium text-slate-400 line-through'}>
            {d.nome}
          </span>,
          <span className="text-slate-500">{d.course?.nome ?? '—'}</span>,
          d.alocacoes.length,
          <span className="flex flex-wrap gap-1">
            {mods.length === 0 ? (
              <span className="text-slate-300">—</span>
            ) : (
              mods.map((m) => (
                <Etiqueta
                  key={m}
                  tom={m === 'EAD' ? 'ok' : m === 'NAO_INFORMADA' ? 'alerta' : 'neutro'}
                >
                  {m === 'NAO_INFORMADA' ? 'sem modalidade' : m.toLowerCase()}
                </Etiqueta>
              ))
            )}
          </span>,
          <form className="flex items-center gap-1">
            <input type="hidden" name="volta" value={volta} />
            <select
              name="modalidade"
              defaultValue={d.modalidadePadrao ?? 'NAO_INFORMADA'}
              className="rounded-lg border border-brand-navy/15 bg-white px-2 py-1 text-[11px] text-brand-navy outline-none focus:border-brand-teal"
            >
              {OPCOES.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
            <button
              formAction={definirModalidade.bind(null, d.id)}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors ${
                temPendente
                  ? 'border-brand-orange/40 bg-brand-orange/10 text-brand-orange hover:bg-brand-orange/20'
                  : 'border-brand-navy/10 bg-white text-slate-400 hover:border-brand-teal/40 hover:text-brand-teal-hover'
              }`}
              title="Aplica às ofertas que ainda estão sem modalidade"
            >
              aplicar
            </button>
          </form>,
          <form>
            <input type="hidden" name="volta" value={volta} />
            <button
              formAction={alternarDisciplinaAtiva.bind(null, d.id)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                d.ativo
                  ? 'border-brand-teal/40 bg-brand-teal/10 text-brand-teal-hover hover:border-brand-orange/50 hover:bg-brand-orange/10 hover:text-brand-orange'
                  : 'border-brand-navy/10 bg-white text-slate-400 hover:border-brand-teal/40 hover:text-brand-teal-hover'
              }`}
              title={d.ativo ? 'Remover do ciclo' : 'Incluir no ciclo'}
            >
              {d.ativo ? 'incluída' : 'fora'}
            </button>
          </form>,
        ];
      })}
    >
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Link
          href="/cadastros/disciplinas"
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            !soPendentes
              ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
              : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
          }`}
        >
          Todas
        </Link>
        <Link
          href="/cadastros/disciplinas?pendentes=1"
          className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
            soPendentes
              ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
              : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-orange/40'
          }`}
        >
          Sem modalidade <span className="tabular-nums">{pendentes}</span>
        </Link>
      </div>
    </Lista>
  );
}
