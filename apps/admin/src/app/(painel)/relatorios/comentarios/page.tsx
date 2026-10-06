/**
 * Fila de moderação dos comentários.
 *
 * A tela mostra o texto, a pergunta e o alvo avaliado — nunca quem escreveu,
 * que o banco não sabe. O recorte de curso e turma aparece porque ajuda a
 * entender o comentário ("a sala 3 não tem projetor"), e é também o que, somado
 * ao texto, pode estreitar o cerco: quem modera precisa ver isso para decidir.
 *
 * Padrão é a fila de pendentes. Abrir direto em "todos" afogaria o que falta
 * fazer no que já foi feito.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';
import type { Prisma, StatusModeracao } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { Lista, POR_PAGINA } from '@/components/Lista';
import { SelecionarTodos } from '@/components/SelecionarTodos';
import { moderarComentario, moderarEmLote } from './actions';

export const dynamic = 'force-dynamic';

const SITUACOES = [
  { chave: 'PENDENTE', rotulo: 'Para ler' },
  { chave: 'APROVADO', rotulo: 'Liberados' },
  { chave: 'OCULTO', rotulo: 'Ocultos' },
  { chave: 'TODOS', rotulo: 'Todos' },
] as const;

const ALVO: Record<string, string> = {
  INSTITUICAO: 'Instituição',
  INFRAESTRUTURA: 'Infraestrutura',
  DEPARTAMENTO: 'Setor',
  COORDENACAO: 'Coordenação',
  CURSO: 'Curso',
  DISCIPLINA: 'Disciplina',
  PROFESSOR_DISCIPLINA: 'Professor',
  AUTOAVALIACAO: 'Autoavaliação',
};

const btn =
  'rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover';

const dia = (d: Date) => d.toLocaleDateString('pt-BR');

/** Id do formulário do lote: as caixas ficam na tabela e o botão, fora dela. */
const LOTE = 'moderacao-lote';

export default async function Moderacao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPainel();
  const sp = await searchParams;

  const q = typeof sp.q === 'string' ? sp.q.trim() : '';
  const pagina = Math.max(1, Number(typeof sp.p === 'string' ? sp.p : 1) || 1);
  const situacao = (typeof sp.s === 'string' ? sp.s : 'PENDENTE') as
    | StatusModeracao
    | 'TODOS';
  const cicloId = typeof sp.ciclo === 'string' ? sp.ciclo : '';

  const ciclos = await prisma.evaluationPeriod.findMany({
    orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
    select: { id: true, nome: true, ano: true },
  });

  // Sem ciclo escolhido, o mais recente: é onde a fila está crescendo.
  const ciclo = ciclos.find((c) => c.id === cicloId) ?? ciclos[0];

  const base: Prisma.AnswerWhereInput = {
    question: { tipo: 'TEXTO_LIVRE' },
    valorTexto: { not: null },
    ...(ciclo ? { responseSet: { periodId: ciclo.id } } : {}),
  };

  const where: Prisma.AnswerWhereInput = {
    ...base,
    ...(situacao === 'TODOS' ? {} : { moderacao: situacao }),
    ...(q ? { valorTexto: { contains: q, mode: 'insensitive' } } : {}),
  };

  const [total, contagens, comentarios] = await Promise.all([
    prisma.answer.count({ where }),
    prisma.answer.groupBy({ by: ['moderacao'], where: base, _count: true }),
    prisma.answer.findMany({
      where,
      orderBy: { responseSet: { submetidoEm: 'desc' } },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        valorTexto: true,
        moderacao: true,
        moderadoEm: true,
        moderadoPor: { select: { nome: true } },
        question: { select: { enunciado: true, block: { select: { titulo: true } } } },
        responseSet: {
          select: {
            targetType: true,
            submetidoEm: true,
            teacher: { select: { nome: true } },
            subject: { select: { nome: true } },
            department: { select: { nome: true } },
            respondentCourse: { select: { nome: true } },
            respondentClass: { select: { nome: true } },
          },
        },
      },
    }),
  ]);

  const quantos = (s: StatusModeracao) =>
    contagens.find((c) => c.moderacao === s)?._count ?? 0;

  const url = (extra: Record<string, string>) =>
    `/relatorios/comentarios?${new URLSearchParams({
      ...(ciclo ? { ciclo: ciclo.id } : {}),
      s: situacao,
      ...(q ? { q } : {}),
      ...extra,
    })}`;

  const linhas = comentarios.map((c) => {
    const alvo =
      c.responseSet.teacher?.nome ??
      c.responseSet.department?.nome ??
      ALVO[c.responseSet.targetType] ??
      c.responseSet.targetType;

    return [
      <input
        key="sel"
        type="checkbox"
        form={LOTE}
        name="ids"
        value={c.id}
        className="h-3.5 w-3.5 accent-[color:var(--color-brand-teal)]"
        aria-label="Selecionar comentário"
      />,
      <div key="texto" className="max-w-xl">
        <p className="whitespace-pre-wrap text-sm text-brand-navy">{c.valorTexto}</p>
        <p className="mt-1 text-[11px] text-slate-400">
          {c.question.block.titulo} · {c.question.enunciado}
        </p>
      </div>,
      <div key="alvo" className="text-xs text-slate-500">
        <p className="font-semibold text-brand-navy">{alvo}</p>
        {c.responseSet.subject && <p>{c.responseSet.subject.nome}</p>}
        <p className="mt-1 text-slate-400">
          {c.responseSet.respondentCourse?.nome ?? '—'}
          {c.responseSet.respondentClass ? ` · ${c.responseSet.respondentClass.nome}` : ''}
        </p>
        <p className="text-slate-400">{dia(c.responseSet.submetidoEm)}</p>
      </div>,
      <div key="situacao" className="text-xs">
        <span
          className={
            c.moderacao === 'APROVADO'
              ? 'font-semibold text-brand-teal-hover'
              : c.moderacao === 'OCULTO'
                ? 'font-semibold text-brand-orange'
                : 'text-slate-400'
          }
        >
          {c.moderacao === 'APROVADO'
            ? 'Liberado'
            : c.moderacao === 'OCULTO'
              ? 'Oculto'
              : 'Para ler'}
        </span>
        {c.moderadoPor && (
          <p className="mt-0.5 text-[11px] text-slate-400">
            {c.moderadoPor.nome.split(' ')[0]}
            {c.moderadoEm ? ` · ${dia(c.moderadoEm)}` : ''}
          </p>
        )}
      </div>,
      <form key="acoes" className="flex flex-wrap justify-end gap-1.5">
        <input type="hidden" name="answerId" value={c.id} />
        {c.moderacao !== 'APROVADO' && (
          <button formAction={moderarComentario.bind(null, 'APROVADO')} className={btn}>
            Liberar
          </button>
        )}
        {c.moderacao !== 'OCULTO' && (
          <button
            formAction={moderarComentario.bind(null, 'OCULTO')}
            className={`${btn} hover:border-brand-orange/50 hover:text-brand-orange`}
          >
            Ocultar
          </button>
        )}
        {c.moderacao !== 'PENDENTE' && (
          <button formAction={moderarComentario.bind(null, 'PENDENTE')} className={btn}>
            Desfazer
          </button>
        )}
      </form>,
    ];
  });

  return (
    <>
      <Lista
        eyebrow="Resultados"
        titulo="Moderação de comentários"
        descricao="Comentário aberto só entra no relatório depois de alguém da comissão ler. Ocultar não apaga: o texto continua no banco e na exportação."
        buscaPlaceholder="Buscar no texto do comentário"
        q={q}
        pagina={pagina}
        total={total}
        href="/relatorios/comentarios"
        colunas={[
          { titulo: <SelecionarTodos formulario={LOTE} />, estreita: true },
          { titulo: 'Comentário' },
          { titulo: 'Sobre o quê' },
          { titulo: 'Situação', estreita: true },
          { titulo: '', estreita: true },
        ]}
        linhas={linhas}
        vazio={
          <p className="text-sm text-slate-500">
            Nenhum comentário neste ciclo ainda.{' '}
            <Link href="/periodos" className="font-semibold text-brand-teal">
              Ver ciclos →
            </Link>
          </p>
        }
      >
        <form id={LOTE} className="flex flex-wrap items-center gap-3">
          {ciclos.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {ciclos.map((c) => (
                <Link
                  key={c.id}
                  href={`/relatorios/comentarios?ciclo=${c.id}&s=${situacao}`}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    c.id === ciclo?.id
                      ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                      : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
                  }`}
                >
                  {c.nome}
                </Link>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {SITUACOES.map((s) => {
              const n =
                s.chave === 'TODOS'
                  ? contagens.reduce((t, c) => t + c._count, 0)
                  : quantos(s.chave as StatusModeracao);
              return (
                <Link
                  key={s.chave}
                  href={url({ s: s.chave, p: '1' })}
                  className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    s.chave === situacao
                      ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                      : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
                  }`}
                >
                  {s.rotulo} <span className="tabular-nums text-slate-400">{n}</span>
                </Link>
              );
            })}
          </div>

          {linhas.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Selecionados:</span>
              <button formAction={moderarEmLote.bind(null, 'APROVADO')} className={btn}>
                Liberar
              </button>
              <button
                formAction={moderarEmLote.bind(null, 'OCULTO')}
                className={`${btn} hover:border-brand-orange/50 hover:text-brand-orange`}
              >
                Ocultar
              </button>
            </div>
          )}
        </form>
      </Lista>
    </>
  );
}
