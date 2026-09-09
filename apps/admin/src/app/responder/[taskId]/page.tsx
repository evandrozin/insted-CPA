/**
 * Wizard de resposta — uma etapa (um alvo) por vez.
 *
 * A etapa vem da URL (`?e=3`), não do estado do cliente: o aluno pode fechar o
 * navegador, voltar pelo botão do navegador ou trocar de aparelho, e cai no
 * mesmo lugar. Cada avanço salva o rascunho no servidor.
 *
 * Sem JavaScript de cliente. O autosave contínuo com debounce entra quando o
 * app mobile chegar — aqui, salvar ao avançar dá a mesma garantia com muito
 * menos coisa para quebrar numa rede instável.
 */
import Image from 'next/image';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { respondenteAtual } from '@/lib/sessao';
import { salvarEtapa, enviar } from '../actions';

export const dynamic = 'force-dynamic';

type Config = {
  min?: number;
  max?: number;
  labels?: Record<string, string>;
  permiteNaoSeAplica?: boolean;
  maxLength?: number;
};

export default async function Responder({
  params,
  searchParams,
}: {
  params: Promise<{ taskId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { taskId } = await params;
  const sp = await searchParams;

  const eu = await respondenteAtual();
  if (!eu) redirect('/entrar');

  const task = await prisma.evaluationTask.findUnique({
    where: { id: taskId },
    include: {
      period: { select: { nome: true, status: true, fechaEm: true, mensagemBoasVindas: true } },
      alvos: { orderBy: { ordem: 'asc' } },
      rascunhos: true,
    },
  });

  if (!task || task.respondentId !== eu.id) notFound();
  if (task.status === 'CONCLUIDA') redirect(`/responder/${taskId}/concluido`);
  if (task.period.status !== 'ABERTO') {
    return <Aviso titulo="Fora do prazo" texto="Este ciclo de avaliação não está aberto." />;
  }

  const total = task.alvos.length;
  const etapaBruta = Number(typeof sp.e === 'string' ? sp.e : 1) || 1;
  const etapa = Math.min(Math.max(1, etapaBruta), total + 1); // +1 = revisão
  const revisao = etapa === total + 1;

  // Blocos e questões da etapa atual.
  const alvo = revisao ? null : task.alvos[etapa - 1];
  const bloco = alvo
    ? await prisma.questionBlock.findUnique({
        where: { id: alvo.blockId },
        include: { questoes: { where: { ativa: true }, orderBy: { ordem: 'asc' } } },
      })
    : null;

  const rascunhoDe = (questionId: string, targetRefId: string) =>
    task.rascunhos.find((r) => r.questionId === questionId && r.targetRefId === targetRefId)
      ?.valor as { numerico?: number; texto?: string; booleano?: boolean; naoSeAplica?: boolean } | undefined;

  const refAtual = alvo?.targetRefId ?? '__global__';
  const progresso = Math.round(((etapa - 1) / total) * 100);

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* ------------------------------------------------------- cabeçalho */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Image
          src="/logo-insted.png"
          alt="Insted"
          width={550}
          height={162}
          className="h-7 w-auto"
          priority
        />
        <Link href="/minhas-avaliacoes" className="text-xs font-semibold text-slate-400 hover:text-brand-teal">
          Salvar e sair
        </Link>
      </header>

      <div className="mt-6">
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-teal">
            {task.period.nome}
          </p>
          <p className="text-xs text-slate-400 tabular-nums">
            {revisao ? 'revisão' : `${etapa} de ${total}`}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-teal transition-all"
            style={{ width: `${revisao ? 100 : progresso}%` }}
          />
        </div>
      </div>

      {etapa === 1 && task.period.mensagemBoasVindas && (
        <p className="mt-6 rounded-2xl bg-white px-5 py-4 text-sm text-slate-600">
          {task.period.mensagemBoasVindas}
        </p>
      )}

      {/* ---------------------------------------------------------- revisão */}
      {revisao ? (
        <Revisao taskId={taskId} respondidas={task.rascunhos.length} total={total} />
      ) : (
        <form className="mt-6">
          <input
            type="hidden"
            name="destino"
            value={`/responder/${taskId}?e=${etapa + 1}`}
          />

          <section className="relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
            <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />

            <div className="border-b border-slate-100 px-6 pb-4 pt-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                {bloco?.titulo}
              </p>
              <h1 className="mt-1 font-brand text-xl font-bold tracking-tight text-brand-navy">
                {alvo?.rotulo}
              </h1>
              {alvo?.subtitulo && <p className="mt-0.5 text-sm text-slate-500">{alvo.subtitulo}</p>}
            </div>

            <ol className="flex flex-col">
              {bloco?.questoes.map((q, i) => {
                const cfg = (q.config ?? {}) as Config;
                const atual = rascunhoDe(q.id, refAtual);
                const campo = `r:${q.id}:${refAtual}`;

                return (
                  <li key={q.id} className="border-b border-slate-50 px-6 py-5 last:border-0">
                    <p className="text-sm font-medium text-brand-navy">
                      <span className="mr-2 font-mono text-xs text-slate-300">{i + 1}</span>
                      {q.enunciado}
                      {!q.obrigatoria && (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-slate-300">
                          opcional
                        </span>
                      )}
                    </p>
                    {q.ajuda && <p className="mt-1 text-xs text-slate-400">{q.ajuda}</p>}

                    <div className="mt-3">
                      {q.tipo === 'LIKERT' || q.tipo === 'NPS' ? (
                        <Escala campo={campo} cfg={cfg} atual={atual} nps={q.tipo === 'NPS'} />
                      ) : q.tipo === 'SIM_NAO' ? (
                        <div className="flex gap-2">
                          {[
                            ['sim', 'Sim'],
                            ['nao', 'Não'],
                          ].map(([v, r]) => (
                            <label key={v} className="cursor-pointer">
                              <input
                                type="radio"
                                name={campo}
                                value={v}
                                defaultChecked={atual?.booleano === (v === 'sim')}
                                className="peer sr-only"
                              />
                              <span className="block rounded-xl border border-brand-navy/15 bg-white px-5 py-2 text-sm text-slate-600 peer-checked:border-brand-teal peer-checked:bg-brand-teal/10 peer-checked:font-semibold peer-checked:text-brand-teal-hover">
                                {r}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          name={campo}
                          defaultValue={atual?.texto ?? ''}
                          rows={3}
                          maxLength={cfg.maxLength ?? 500}
                          placeholder="Escreva aqui (opcional)"
                          className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal"
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>

          <div className="mt-5 flex items-center justify-between gap-3">
            {etapa > 1 ? (
              <Link
                href={`/responder/${taskId}?e=${etapa - 1}`}
                className="rounded-xl border border-brand-navy/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:border-brand-teal/40"
              >
                ← Voltar
              </Link>
            ) : (
              <span />
            )}
            <button
              formAction={salvarEtapa.bind(null, taskId)}
              className="rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
            >
              {etapa === total ? 'Revisar respostas' : 'Continuar'}
            </button>
          </div>

          <p className="mt-3 text-center text-xs text-slate-400">
            Suas respostas ficam salvas a cada etapa. Pode sair e voltar depois.
          </p>
        </form>
      )}
    </div>
  );
}

/** Escala Likert ou NPS — botões grandes, bons de tocar no celular. */
function Escala({
  campo,
  cfg,
  atual,
  nps,
}: {
  campo: string;
  cfg: Config;
  atual?: { numerico?: number; naoSeAplica?: boolean };
  nps: boolean;
}) {
  const min = cfg.min ?? (nps ? 0 : 1);
  const max = cfg.max ?? (nps ? 10 : 5);
  const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-wrap gap-2">
      {valores.map((v) => (
        <label key={v} className="cursor-pointer">
          <input
            type="radio"
            name={campo}
            value={v}
            defaultChecked={atual?.numerico === v}
            className="peer sr-only"
          />
          <span
            className={`flex flex-col items-center justify-center rounded-xl border border-brand-navy/15 bg-white text-slate-600 peer-checked:border-brand-teal peer-checked:bg-brand-teal/10 peer-checked:font-semibold peer-checked:text-brand-teal-hover ${
              nps ? 'h-11 w-11 text-sm' : 'min-w-20 px-3 py-2'
            }`}
          >
            <span className={nps ? '' : 'text-xs font-semibold'}>{v}</span>
            {!nps && cfg.labels?.[String(v)] && (
              <span className="mt-0.5 text-[10px] leading-tight">{cfg.labels[String(v)]}</span>
            )}
          </span>
        </label>
      ))}

      {cfg.permiteNaoSeAplica && (
        <label className="cursor-pointer">
          <input
            type="radio"
            name={campo}
            value="__na__"
            defaultChecked={Boolean(atual?.naoSeAplica)}
            className="peer sr-only"
          />
          <span className="flex min-w-20 items-center justify-center rounded-xl border border-dashed border-brand-navy/20 bg-white px-3 py-2 text-xs text-slate-400 peer-checked:border-slate-400 peer-checked:bg-slate-100 peer-checked:font-semibold peer-checked:text-slate-600">
            Não se aplica
          </span>
        </label>
      )}
    </div>
  );
}

function Revisao({
  taskId,
  respondidas,
  total,
}: {
  taskId: string;
  respondidas: number;
  total: number;
}) {
  return (
    <form className="mt-6">
      <section className="relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-white px-6 py-6">
        <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />
        <h1 className="font-brand text-xl font-bold tracking-tight text-brand-navy">
          Tudo pronto para enviar
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Você percorreu as {total} etapas e registrou {respondidas} respostas.
        </p>

        <div className="mt-5 rounded-xl bg-brand-light px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-brand-navy">O envio é definitivo e anônimo.</p>
          <p className="mt-1">
            Depois de enviar, não é possível alterar. Nem a CPA nem a coordenação conseguem ligar
            estas respostas a você.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            formAction={enviar.bind(null, taskId)}
            className="rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Enviar avaliação
          </button>
          <Link
            href={`/responder/${taskId}?e=${total}`}
            className="text-sm font-semibold text-slate-500 hover:text-brand-teal"
          >
            ← Revisar a última etapa
          </Link>
        </div>
      </section>
    </form>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="font-brand text-xl font-bold text-brand-navy">{titulo}</h1>
      <p className="mt-2 text-sm text-slate-500">{texto}</p>
      <Link
        href="/minhas-avaliacoes"
        className="mt-6 inline-block rounded-xl bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white"
      >
        Voltar
      </Link>
    </div>
  );
}
