/**
 * Cards de UMA pessoa no ciclo — e como tirar os que não são dela.
 *
 * A tarefa é gerada uma vez, com as alocações do momento. Depois a CPA corrige
 * turma, desliga oferta, desativa turma — e a tarefa já criada continua com os
 * cards antigos. Esta tela mostra, card por card, o que ainda confere com as
 * alocações de hoje e o que não confere, e deixa remover só o que a CPA marcar.
 *
 * Não refaz a tarefa: refazer descartaria o rascunho de quem já começou. Os
 * cards que ficam mantêm as respostas em rascunho; só os removidos as perdem, e
 * a tela diz quantas antes.
 *
 * Mostra QUANTAS respostas em rascunho há em cada card, nunca o conteúdo: a
 * lista é do lado da tarefa (quem), não do lado da resposta (o quê).
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { GeradorDeAlvos } from '@insted/avaliacao';
import { Etiqueta } from '@/components/Lista';
import { atualizarCardsDoRespondente } from '../../../actions';

export const dynamic = 'force-dynamic';

const TIPO: Record<string, string> = {
  INSTITUICAO: 'Instituição',
  INFRAESTRUTURA: 'Infraestrutura',
  DEPARTAMENTO: 'Setor',
  COORDENACAO: 'Coordenação',
  CURSO: 'Curso',
  DISCIPLINA: 'Disciplina',
  TURMA: 'Turma',
  PROFESSOR_DISCIPLINA: 'Professor',
  AUTOAVALIACAO: 'Autoavaliação',
};

const SITUACAO: Record<string, string> = {
  PENDENTE: 'pendente',
  EM_ANDAMENTO: 'em andamento',
  CONCLUIDA: 'enviada',
  DISPENSADA: 'retirada do ciclo',
};

const cartao = 'rounded-2xl border border-brand-navy/10 bg-white';

export default async function CardsDoRespondente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; taskId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // A guarda do layout protege a navegação; a página confere por conta própria,
  // porque ela lê tarefas de pessoas.
  await exigirPainel();
  const { id, taskId } = await params;
  const sp = await searchParams;

  const plano = await new GeradorDeAlvos(prisma).planejarTarefa(taskId).catch(() => null);
  if (!plano || plano.periodId !== id) notFound();

  const ciclo = await prisma.evaluationPeriod.findUnique({
    where: { id },
    select: { nome: true, status: true },
  });
  if (!ciclo) notFound();

  const vivo = ['RASCUNHO', 'AGENDADO', 'ABERTO'].includes(ciclo.status);
  const editavel = plano.editavel && vivo;

  // `ok` volta da ação, só com números.
  const [okRemovidos, okDescartados, okIncluidos] = (typeof sp.ok === 'string' ? sp.ok : '').split('.');
  const resumo =
    typeof sp.ok === 'string'
      ? {
          removidos: Number(okRemovidos) || 0,
          descartados: Number(okDescartados) || 0,
          incluidos: Number(okIncluidos) || 0,
        }
      : null;

  const naoConferem = plano.cards.filter((c) => !c.valido);
  const sugeridos = naoConferem.filter((c) => c.removivel);
  const comRascunho = plano.cards.filter((c) => c.removivel && c.rascunhos > 0);

  const alocacoes =
    plano.papel === 'PROFESSOR'
      ? `/alocacoes/docentes?q=${encodeURIComponent(plano.nome)}`
      : plano.papel === 'ALUNO'
        ? `/alocacoes/matriculas?q=${encodeURIComponent(plano.matricula)}`
        : null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <Link
        href={`/periodos/${id}/respondentes?status=PENDENTE`}
        className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
      >
        ← voltar aos respondentes
      </Link>

      <header className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          {ciclo.nome}
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          {plano.nome}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <span className="font-mono text-xs">{plano.matricula}</span>
          <span>· {plano.formulario}</span>
          <Etiqueta tom={plano.status === 'EM_ANDAMENTO' ? 'alerta' : 'neutro'}>
            {SITUACAO[plano.status] ?? plano.status.toLowerCase()}
            {plano.status === 'EM_ANDAMENTO' && ` ${plano.progresso}%`}
          </Etiqueta>
        </p>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">
          Estes são os cards da tarefa desta pessoa. A coluna <strong>Situação</strong> compara cada
          um com as alocações de hoje: o que não confere (turma trocada, oferta desligada, turma
          desativada) vem marcado para remover. Você pode marcar ou desmarcar qualquer card que
          não seja fixo do formulário.
          {' '}
          <Link
            href={`/periodos/${id}/respondentes/${taskId}/previa`}
            className="font-semibold text-brand-teal"
          >
            Ver o formulário como ela vê →
          </Link>
          {alocacoes && (
            <>
              {' '}
              Para corrigir na origem, ajuste em{' '}
              <Link href={alocacoes} className="font-semibold text-brand-teal">
                {plano.papel === 'PROFESSOR' ? 'Alocações docentes' : 'Matrículas'} →
              </Link>
            </>
          )}
        </p>
      </header>

      {resumo && (
        <div className="mt-6 rounded-2xl border border-brand-teal/30 bg-brand-teal/5 px-5 py-3 text-sm text-brand-navy">
          <strong className="font-semibold text-brand-teal-hover">Cards atualizados.</strong>{' '}
          {resumo.removidos} removido(s), {resumo.incluidos} incluído(s)
          {resumo.descartados > 0 && <>, {resumo.descartados} resposta(s) em rascunho descartada(s)</>}.
        </div>
      )}

      {!editavel && (
        <div className="mt-6 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-5 py-3 text-sm text-brand-orange">
          {plano.motivoBloqueio ?? 'O ciclo não está mais aberto: os cards não podem mudar.'}
        </div>
      )}

      <form className={`${cartao} mt-6`}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <h2 className="font-brand text-lg font-bold text-brand-navy">
            Cards da tarefa{' '}
            <span className="text-sm font-normal text-slate-400">({plano.cards.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            {naoConferem.length === 0 ? (
              <>Todos os cards conferem com as alocações de hoje.</>
            ) : (
              <>
                <strong className="text-brand-orange">{naoConferem.length}</strong>{' '}
                {naoConferem.length === 1 ? 'card não confere' : 'cards não conferem'} com as
                alocações de hoje.
              </>
            )}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['', 'Tipo', 'Card', 'Situação', 'Rascunho'].map((t, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400"
                  >
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plano.cards.map((c) => (
                <tr
                  key={c.id}
                  className={`border-b border-slate-50 last:border-0 ${c.valido ? '' : 'bg-brand-orange/5'}`}
                >
                  <td className="px-4 py-2.5 align-top">
                    <input
                      type="checkbox"
                      name="remover"
                      value={c.id}
                      defaultChecked={editavel && !c.valido && c.removivel}
                      disabled={!editavel || !c.removivel}
                      aria-label={`Remover ${c.rotulo}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--color-brand-orange)] disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top">
                    <Etiqueta tom="neutro">{TIPO[c.targetType] ?? c.targetType}</Etiqueta>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <p className="font-medium text-brand-navy">{c.rotulo}</p>
                    {c.subtitulo && <p className="text-xs text-slate-400">{c.subtitulo}</p>}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {c.concluido ? (
                      <Etiqueta tom="neutro">já respondido</Etiqueta>
                    ) : !c.removivel ? (
                      <Etiqueta tom="apagado">fixo do formulário</Etiqueta>
                    ) : c.valido ? (
                      <Etiqueta tom="ok">confere</Etiqueta>
                    ) : (
                      <>
                        <Etiqueta tom="alerta">não confere</Etiqueta>
                        <p className="mt-1 max-w-xs text-xs text-slate-500">{c.motivo}</p>
                      </>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 align-top text-xs">
                    {c.rascunhos > 0 ? (
                      <span className="font-semibold text-brand-orange">
                        {c.rascunhos} {c.rascunhos === 1 ? 'resposta' : 'respostas'}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {plano.faltam.length > 0 && editavel && (
          <div className="border-t border-slate-100 px-5 py-4">
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-brand-navy">
              <input
                type="checkbox"
                name="incluir"
                defaultChecked
                className="mt-1 accent-[color:var(--color-brand-teal)]"
              />
              <span>
                Incluir também os <strong>{plano.faltam.length}</strong>{' '}
                {plano.faltam.length === 1 ? 'card que falta' : 'cards que faltam'} — as alocações
                de hoje geram {plano.faltam.length === 1 ? 'este' : 'estes'}, e a tarefa ainda não
                tem:
                <span className="mt-1 block text-xs text-slate-500">
                  {plano.faltam.map((f) => `${TIPO[f.targetType] ?? f.targetType}: ${f.rotulo}`).join(' · ')}
                </span>
              </span>
            </label>
          </div>
        )}

        {editavel && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-4">
            {comRascunho.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-brand-orange">
                <input
                  type="checkbox"
                  name="ciente"
                  className="accent-[color:var(--color-brand-orange)]"
                />
                Estou ciente: as respostas em rascunho dos cards que eu remover são descartadas.
              </label>
            )}
            <button
              formAction={atualizarCardsDoRespondente.bind(null, id, taskId)}
              className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
            >
              Aplicar atualização
            </button>
            <p className="text-xs text-slate-400">
              {sugeridos.length > 0
                ? `${sugeridos.length} card(s) já vêm marcados para remover. `
                : ''}
              Só esta tarefa muda; as dos outros respondentes não são tocadas.
            </p>
          </div>
        )}
      </form>
    </div>
  );
}
