/**
 * Relatório de um ciclo.
 *
 * Mostra o que a CPA precisa ler sem abrir planilha: média por bloco, por
 * pergunta, por curso e por professor. Quem for cruzar dado usa a exportação —
 * esta tela é para a leitura corrida e para a reunião.
 *
 * O que ela não faz, deliberadamente: ranking de professor. A média por
 * docente aparece em ordem alfabética, não ordenada por nota. Ordenar por nota
 * transforma um instrumento de melhoria em placar, e é o uso que mais
 * depressa faz um corpo docente deixar de confiar na avaliação.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import {
  mediasPorBloco,
  mediasPorCurso,
  mediasPorProfessor,
  estatisticasPorPergunta,
} from '@/lib/relatorio';

export const dynamic = 'force-dynamic';

const numero = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const media = (n: number | null) => (n === null ? '—' : n.toFixed(2).replace('.', ','));

const cartao = 'rounded-2xl border border-brand-navy/10 bg-white px-5 py-5';
const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400';

export default async function Relatorios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPainel();
  const sp = await searchParams;
  const escolhido = typeof sp.ciclo === 'string' ? sp.ciclo : '';

  const ciclos = await prisma.evaluationPeriod.findMany({
    orderBy: [{ ano: 'desc' }, { criadoEm: 'desc' }],
    select: { id: true, nome: true, ano: true, status: true, minimoRespostasExibicao: true },
  });

  if (ciclos.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
        <h1 className="font-brand text-3xl font-bold text-brand-navy">Relatórios</h1>
        <p className="mt-4 text-sm text-slate-500">
          Nenhum ciclo cadastrado.{' '}
          <Link href="/periodos" className="font-semibold text-brand-teal">
            Criar o primeiro →
          </Link>
        </p>
      </div>
    );
  }

  const ciclo = ciclos.find((c) => c.id === escolhido) ?? ciclos[0];
  const minimo = ciclo.minimoRespostasExibicao;

  const [blocos, perguntas, cursos, professores, comentarios, tarefas, concluidas] =
    await Promise.all([
      mediasPorBloco(ciclo.id),
      estatisticasPorPergunta(ciclo.id),
      mediasPorCurso(ciclo.id, minimo),
      mediasPorProfessor(ciclo.id, minimo),
      prisma.answer.count({
        where: {
          responseSet: { periodId: ciclo.id },
          question: { tipo: 'TEXTO_LIVRE' },
          valorTexto: { not: null },
          moderacao: 'APROVADO',
        },
      }),
      prisma.evaluationTask.count({
        where: { periodId: ciclo.id, status: { not: 'DISPENSADA' } },
      }),
      prisma.evaluationTask.count({ where: { periodId: ciclo.id, status: 'CONCLUIDA' } }),
    ]);

  const respostas = blocos.reduce((t, b) => t + b.respostas, 0);
  const adesao = tarefas > 0 ? Math.round((concluidas / tarefas) * 100) : 0;
  const ocultos = [...cursos, ...professores].filter((a) => a.suprimido).length;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <header>
        <p className={eyebrow}>Resultados</p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          {ciclo.nome}
        </h1>
        <p className="mt-2 text-slate-500">
          {ciclo.ano} · ciclo {ciclo.status.toLowerCase()} · mínimo de {minimo} respostas para
          exibir um alvo
        </p>

        {ciclos.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ciclos.map((c) => (
              <Link
                key={c.id}
                href={`/relatorios?ciclo=${c.id}`}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  c.id === ciclo.id
                    ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                    : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
                }`}
              >
                {c.nome}
              </Link>
            ))}
          </div>
        )}
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Adesão', valor: `${adesao}%` },
          { rotulo: 'Respostas na média', valor: numero(respostas) },
          { rotulo: 'Comentários liberados', valor: numero(comentarios) },
          { rotulo: 'Alvos ocultados', valor: numero(ocultos) },
        ].map((c) => (
          <div key={c.rotulo} className={cartao}>
            <p className="font-brand text-2xl font-bold tabular-nums text-brand-navy">{c.valor}</p>
            <p className={`mt-1 ${eyebrow}`}>{c.rotulo}</p>
          </div>
        ))}
      </section>

      {respostas === 0 && (
        <p className="mt-6 rounded-2xl border border-brand-navy/10 bg-white px-5 py-6 text-sm text-slate-500">
          Ainda não há resposta numérica neste ciclo. Perguntas de escolha e comentários não entram
          em média — elas aparecem abaixo, por pergunta, em contagem.
        </p>
      )}

      {/* ------------------------------------------------------- por bloco */}
      <section className="mt-10">
        <h2 className="font-brand text-lg font-bold text-brand-navy">Por bloco</h2>
        <p className="mt-1 text-xs text-slate-500">
          Média das perguntas de escala, ignorando as informativas (peso 0) e quem marcou
          &ldquo;não se aplica&rdquo;.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-[0.06em] text-slate-400">
                <th className="px-5 py-3 font-semibold">Bloco</th>
                <th className="px-5 py-3 text-right font-semibold">Média</th>
                <th className="px-5 py-3 text-right font-semibold">Respostas</th>
                <th className="px-5 py-3 text-right font-semibold">Cards</th>
              </tr>
            </thead>
            <tbody>
              {blocos.map((b) => (
                <tr key={b.blockId} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-3 text-brand-navy">{b.titulo}</td>
                  <td className="px-5 py-3 text-right font-semibold tabular-nums text-brand-navy">
                    {media(b.media)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    {numero(b.respostas)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    {numero(b.conjuntos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------------------------------------------- por pergunta */}
      <section className="mt-10">
        <h2 className="font-brand text-lg font-bold text-brand-navy">Por pergunta</h2>

        <div className="mt-4 flex flex-col gap-2">
          {perguntas.map((q) => {
            const total = Object.values(q.distribuicao).reduce((t, n) => t + n, 0);
            const pontos = Object.keys(q.distribuicao)
              .map(Number)
              .sort((a, b) => a - b);

            return (
              <div key={q.questionId} className={cartao}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="min-w-0 flex-1 text-sm text-brand-navy">
                    <span className="mr-2 font-mono text-xs text-slate-300">
                      {q.blocoOrdem + 1}.{q.ordem + 1}
                    </span>
                    {q.enunciado}
                  </p>
                  {q.media !== null && (
                    <p className="shrink-0 font-brand text-xl font-bold tabular-nums text-brand-navy">
                      {media(q.media)}
                    </p>
                  )}
                </div>

                {pontos.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {pontos.map((p) => {
                      const n = q.distribuicao[String(p)];
                      const pct = total > 0 ? Math.round((n / total) * 100) : 0;
                      return (
                        <li key={p} className="flex items-center gap-3 text-xs">
                          <span className="w-6 shrink-0 text-right font-mono text-slate-400">
                            {p}
                          </span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full bg-brand-teal"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="w-20 shrink-0 tabular-nums text-slate-400">
                            {numero(n)} · {pct}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {q.alternativas.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1">
                    {q.alternativas.map((a) => {
                      const somaAlt = q.alternativas.reduce((t, x) => t + x.total, 0);
                      const pct = somaAlt > 0 ? Math.round((a.total / somaAlt) * 100) : 0;
                      return (
                        <li key={a.rotulo} className="flex items-center gap-3 text-xs">
                          <span className="w-44 shrink-0 truncate text-slate-500" title={a.rotulo}>
                            {a.rotulo}
                          </span>
                          <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                            <span
                              className="block h-full rounded-full bg-brand-blue"
                              style={{ width: `${pct}%` }}
                            />
                          </span>
                          <span className="w-20 shrink-0 tabular-nums text-slate-400">
                            {numero(a.total)} · {pct}%
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <p className="mt-2 text-[11px] text-slate-400">
                  {numero(q.respostas)} respostas
                  {q.naoSeAplica > 0 && ` · ${numero(q.naoSeAplica)} marcaram "não se aplica"`}
                  {q.peso === 0 && ' · informativa, fora da média'}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------- por curso e professor */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <TabelaDeAlvos
          titulo="Por curso"
          descricao="Média das respostas de quem é daquele curso."
          alvos={cursos}
          minimo={minimo}
        />
        <TabelaDeAlvos
          titulo="Por professor"
          descricao="Ordem alfabética, de propósito: a avaliação serve à melhoria, não a um placar."
          alvos={professores}
          minimo={minimo}
        />
      </div>

      <p className="mt-8 text-xs text-slate-400">
        Comentários liberados pela moderação aparecem no relatório final.{' '}
        <Link
          href={`/relatorios/comentarios?ciclo=${ciclo.id}`}
          className="font-semibold text-brand-teal"
        >
          Ir para a moderação →
        </Link>
      </p>
    </div>
  );
}

function TabelaDeAlvos({
  titulo,
  descricao,
  alvos,
  minimo,
}: {
  titulo: string;
  descricao: string;
  alvos: { refId: string; nome: string; detalhe: string | null; media: number | null; respondentes: number; suprimido: boolean }[];
  minimo: number;
}) {
  const visiveis = alvos.filter((a) => !a.suprimido);
  const ocultos = alvos.length - visiveis.length;

  return (
    <section>
      <h2 className="font-brand text-lg font-bold text-brand-navy">{titulo}</h2>
      <p className="mt-1 text-xs text-slate-500">{descricao}</p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
        {visiveis.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Nada a exibir ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {visiveis.map((a) => (
                <tr key={a.refId} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5 text-brand-navy">
                    {a.nome}
                    {a.detalhe && <span className="ml-2 text-xs text-slate-400">{a.detalhe}</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs tabular-nums text-slate-400">
                    {a.respondentes}
                  </td>
                  <td className="px-5 py-2.5 text-right font-semibold tabular-nums text-brand-navy">
                    {media(a.media)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {ocultos > 0 && (
        <p className="mt-2 text-[11px] text-slate-400">
          {ocultos} {ocultos === 1 ? 'alvo ficou de fora' : 'alvos ficaram de fora'} por ter menos
          de {minimo} respostas — com tão poucas, a média deixa de ser anônima.
        </p>
      )}
    </section>
  );
}
