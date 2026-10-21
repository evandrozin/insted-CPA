/**
 * Como UMA pessoa vê a avaliação — para a CPA conferir antes de cobrar.
 *
 * Mostra as etapas da tarefa dela (os cards reais: as turmas e os cursos dela),
 * com as perguntas de cada bloco, no mesmo visual da tela de resposta.
 *
 * É SÓ LEITURA, e isso não é detalhe:
 * - não abre sessão como a pessoa: é a sessão da CPA que lê, e a rota fica atrás
 *   da guarda do painel;
 * - não salva nada e não registra resposta: os campos são desabilitados e não
 *   há ação de gravar;
 * - não mostra rascunho nem resposta de ninguém — só a estrutura do formulário
 *   e os rótulos dos cards. A lista é do lado da tarefa (quem), nunca da
 *   resposta (o quê).
 */
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { Etiqueta } from '@/components/Lista';
import { EtapaPrevia, type BlocoDaEtapa } from '@/components/PrevisaoDeEtapa';

export const dynamic = 'force-dynamic';

const PAPEL: Record<string, string> = {
  ALUNO: 'aluno',
  PROFESSOR: 'docente',
  TECNICO_ADMIN: 'técnico-administrativo',
};

export default async function PreviaDoRespondente({
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

  const task = await prisma.evaluationTask.findUnique({
    where: { id: taskId },
    select: {
      periodId: true,
      status: true,
      period: { select: { nome: true, mensagemBoasVindas: true } },
      periodForm: { select: { form: { select: { nome: true } } } },
      respondent: { select: { nome: true, matricula: true, role: true } },
      alvos: { orderBy: { ordem: 'asc' } },
    },
  });
  if (!task || task.periodId !== id) notFound();

  const total = task.alvos.length;
  const todas = sp.e === 'todas';
  const etapa = todas
    ? 0
    : Math.min(Math.max(1, Number(typeof sp.e === 'string' ? sp.e : 1) || 1), total + 1);
  const revisao = !todas && etapa === total + 1;

  // Os blocos de todas as etapas de uma vez: uma consulta, não uma por etapa.
  const blocos = await prisma.questionBlock.findMany({
    where: { id: { in: [...new Set(task.alvos.map((a) => a.blockId))] } },
    select: {
      id: true,
      titulo: true,
      obrigatorio: true,
      questoes: {
        where: { ativa: true },
        orderBy: { ordem: 'asc' },
        select: {
          id: true,
          tipo: true,
          enunciado: true,
          ajuda: true,
          obrigatoria: true,
          config: true,
          condicao: true,
          opcoes: { orderBy: { ordem: 'asc' }, select: { id: true, rotulo: true } },
        },
      },
    },
  });
  const porBloco = new Map<string, BlocoDaEtapa>(blocos.map((b) => [b.id, b]));

  const base = `/periodos/${id}/respondentes/${taskId}`;
  const link = (e: number | 'todas') => `${base}/previa?e=${e}`;

  const etapas = todas ? task.alvos.map((a, i) => ({ a, n: i + 1 })) : revisao ? [] : [{ a: task.alvos[etapa - 1], n: etapa }];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* --------------------------------------- faixa da CPA (não é do aluno) */}
      <div className="rounded-2xl border border-dashed border-brand-orange/50 bg-brand-orange/5 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-orange">
          Pré-visualização · só a CPA vê isto
        </p>
        <p className="mt-1 text-sm text-brand-navy">
          É assim que <strong>{task.respondent.nome}</strong>{' '}
          <span className="text-slate-500">
            ({PAPEL[task.respondent.role] ?? task.respondent.role.toLowerCase()},{' '}
            <span className="font-mono text-xs">{task.respondent.matricula}</span>)
          </span>{' '}
          vê <em>{task.periodForm.form.nome}</em>.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Somente leitura: nada é salvo, nenhuma resposta é registrada e a pessoa não é avisada.
          Os campos ficam desabilitados.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Link href={link(1)} className={`rounded-lg border px-2.5 py-1 font-semibold ${!todas ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover' : 'border-brand-navy/10 bg-white text-slate-500'}`}>
            Etapa a etapa
          </Link>
          <Link href={link('todas')} className={`rounded-lg border px-2.5 py-1 font-semibold ${todas ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover' : 'border-brand-navy/10 bg-white text-slate-500'}`}>
            Todas as {total} etapas
          </Link>
          <span className="text-slate-300">·</span>
          <Link href={base} className="font-semibold text-brand-teal hover:text-brand-teal-hover">
            Ver os cards desta pessoa
          </Link>
          <Link
            href={`/periodos/${id}/respondentes?status=PENDENTE`}
            className="font-semibold text-slate-400 hover:text-brand-teal"
          >
            ← voltar aos respondentes
          </Link>
          {task.status === 'DISPENSADA' && <Etiqueta tom="apagado">retirada do ciclo</Etiqueta>}
        </div>
      </div>

      {/* ------------------------------------------- a tela, como a pessoa vê */}
      <div className="mt-6 rounded-3xl bg-brand-light px-4 py-6 sm:px-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Image
            src="/logo-insted.png"
            alt="Insted"
            width={550}
            height={162}
            className="h-7 w-auto"
          />
          <span className="text-xs font-semibold text-slate-300">Salvar e sair</span>
        </header>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-brand-teal">
              {task.period.nome}
            </p>
            <p className="text-xs text-slate-400 tabular-nums">
              {todas ? `${total} etapas` : revisao ? 'revisão' : `${etapa} de ${total}`}
            </p>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-brand-teal"
              style={{
                width: `${todas ? 0 : revisao ? 100 : Math.round(((etapa - 1) / Math.max(total, 1)) * 100)}%`,
              }}
            />
          </div>
        </div>

        {(todas || etapa === 1) && task.period.mensagemBoasVindas && (
          <p className="mt-6 whitespace-pre-line rounded-2xl bg-white px-5 py-4 text-sm leading-relaxed text-slate-600">
            {task.period.mensagemBoasVindas}
          </p>
        )}

        {total === 0 && (
          <p className="mt-6 rounded-2xl bg-white px-5 py-4 text-sm text-slate-500">
            Esta tarefa não tem nenhum card: a pessoa abriria uma avaliação vazia. Verifique as
            alocações e atualize os cards dela.
          </p>
        )}

        {etapas.map(({ a, n }) => (
          <div key={a.id} className="mt-6">
            {todas && (
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                Etapa {n} de {total}
              </p>
            )}
            <EtapaPrevia
              bloco={porBloco.get(a.blockId) ?? null}
              rotulo={a.rotulo}
              subtitulo={a.subtitulo}
            />
            {!todas && porBloco.get(a.blockId) && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                {porBloco.get(a.blockId)!.obrigatorio
                  ? 'Neste card as perguntas obrigatórias precisam de resposta para avançar.'
                  : 'Este card é opcional: a pessoa pode avançar sem responder.'}
              </p>
            )}
          </div>
        ))}

        {revisao && (
          <section className="relative mt-6 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white px-6 py-6">
            <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />
            <h2 className="font-brand text-xl font-bold tracking-tight text-brand-navy">
              Tudo pronto para enviar
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Você percorreu as {total} etapas e registrou as respostas.
            </p>
            <div className="mt-5 rounded-xl bg-brand-light px-4 py-3 text-sm text-slate-600">
              <p className="font-semibold text-brand-navy">O envio é definitivo e anônimo.</p>
              <p className="mt-1">
                Depois de enviar, não é possível alterar. Nem a CPA nem a coordenação conseguem
                ligar estas respostas a você.
              </p>
            </div>
            <span className="mt-6 inline-block cursor-not-allowed rounded-xl bg-brand-teal/40 px-6 py-2.5 text-sm font-semibold text-white">
              Enviar avaliação
            </span>
          </section>
        )}

        {/* navegação: no real é "Voltar" e "Continuar", aqui só percorre a prévia */}
        {!todas && total > 0 && (
          <div className="mt-5 flex items-center justify-between gap-3">
            {etapa > 1 ? (
              <Link
                href={link(etapa - 1)}
                className="rounded-xl border border-brand-navy/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-500 transition-colors hover:border-brand-teal/40"
              >
                ← Voltar
              </Link>
            ) : (
              <span />
            )}
            {!revisao && (
              <Link
                href={link(etapa + 1)}
                className="rounded-xl bg-brand-teal px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
              >
                {etapa === total ? 'Revisar respostas' : 'Continuar'}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
