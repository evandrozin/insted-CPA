/**
 * Quem já respondeu — e a liberação de um novo envio.
 *
 * A tela existe para um caso concreto: o aluno enviou por engano (mandou
 * incompleto, clicou cedo, a conexão caiu e ele achou que não tinha ido) e
 * precisa responder de novo.
 *
 * Liberar APAGA o que ele enviou. É o único jeito honesto: reabrir sem apagar
 * faria a pessoa contar duas vezes nas médias do professor, sem que ninguém
 * conseguisse depois descobrir quais conjuntos eram duplicados.
 *
 * A tela mostra quem respondeu, nunca o que respondeu — a lista é de tarefas,
 * e tarefa não carrega resposta. Ver docs/09-anonimato-e-retratacao.md.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { liberarReenvio } from '../../actions';

export const dynamic = 'force-dynamic';

const dataHora = (d: Date | null) =>
  d
    ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

export default async function Respondentes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const filtro = typeof sp.status === 'string' ? sp.status : 'CONCLUIDA';

  const ciclo = await prisma.evaluationPeriod
    .findUnique({ where: { id }, select: { id: true, nome: true, ano: true, status: true } })
    .catch(() => null);
  if (!ciclo) notFound();

  const where = {
    periodId: id,
    ...(filtro === 'TODOS' ? {} : { status: filtro as 'CONCLUIDA' | 'PENDENTE' }),
    ...(q
      ? {
          respondent: {
            OR: [
              { nome: { contains: q, mode: 'insensitive' as const } },
              { matricula: { contains: q, mode: 'insensitive' as const } },
            ],
          },
        }
      : {}),
  };

  const [total, tarefas, concluidas] = await Promise.all([
    prisma.evaluationTask.count({ where }),
    prisma.evaluationTask.findMany({
      where,
      orderBy: [{ concluidaEm: 'desc' }, { criadoEm: 'asc' }],
      skip: pular,
      take: POR_PAGINA,
      select: {
        id: true,
        status: true,
        concluidaEm: true,
        loteId: true,
        respondent: { select: { nome: true, matricula: true } },
        _count: { select: { alvos: true } },
      },
    }),
    prisma.evaluationTask.count({ where: { periodId: id, status: 'CONCLUIDA' } }),
  ]);

  const aberto = ciclo.status === 'ABERTO';
  const aba = (valor: string, rotulo: string) => {
    const ativa = filtro === valor;
    return (
      <Link
        key={valor}
        href={`/periodos/${id}/respondentes?status=${valor}`}
        className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
          ativa
            ? 'bg-brand-teal/10 text-brand-teal-hover'
            : 'text-slate-500 hover:text-brand-teal-hover'
        }`}
      >
        {rotulo}
      </Link>
    );
  };

  return (
    <Lista
      eyebrow={`Ciclo ${ciclo.ano}`}
      titulo="Respondentes"
      descricao={`${concluidas.toLocaleString('pt-BR')} enviaram. Liberar um novo envio apaga as respostas anteriores da pessoa — é o que evita que ela conte duas vezes nas médias.`}
      buscaPlaceholder="Buscar por nome ou matrícula…"
      q={q}
      pagina={pagina}
      total={total}
      href={`/periodos/${id}/respondentes`}
      colunas={[
        { titulo: 'Matrícula', estreita: true },
        { titulo: 'Respondente' },
        { titulo: 'Cards', numerica: true, estreita: true },
        { titulo: 'Situação', estreita: true },
        { titulo: 'Enviado em', estreita: true },
        { titulo: '', estreita: true },
      ]}
      linhas={tarefas.map((t) => [
        <span className="font-mono text-xs text-slate-400">{t.respondent.matricula}</span>,
        <span className="font-medium">{t.respondent.nome}</span>,
        t._count.alvos,
        t.status === 'CONCLUIDA' ? (
          <Etiqueta tom="ok">enviado</Etiqueta>
        ) : (
          <Etiqueta tom="neutro">pendente</Etiqueta>
        ),
        <span className="text-xs text-slate-400">{dataHora(t.concluidaEm)}</span>,
        t.status !== 'CONCLUIDA' ? (
          <span className="text-xs text-slate-300">—</span>
        ) : !aberto ? (
          <span className="text-xs text-slate-300" title="O vínculo com as respostas foi apagado no encerramento.">
            ciclo encerrado
          </span>
        ) : !t.loteId ? (
          <span
            className="text-xs text-slate-300"
            title="Envio anterior à janela de retratação: não há como localizar o que foi gravado."
          >
            sem lote
          </span>
        ) : (
          <form>
            <button
              formAction={liberarReenvio.bind(null, id, t.id)}
              className="rounded-lg border border-brand-orange/40 bg-brand-orange/5 px-2.5 py-1 text-[11px] font-semibold text-brand-orange transition-colors hover:bg-brand-orange/15"
            >
              Liberar novo envio
            </button>
          </form>
        ),
      ])}
      vazio={
        <p className="text-sm text-slate-400">
          Ninguém enviou ainda. Assim que as respostas começarem a chegar, elas aparecem aqui.
        </p>
      }
    >
      <div className="flex flex-wrap items-center gap-1">
        {aba('CONCLUIDA', 'Enviaram')}
        {aba('PENDENTE', 'Pendentes')}
        {aba('TODOS', 'Todos')}
      </div>

      {!aberto && (
        <p className="mt-4 rounded-xl border border-brand-navy/10 bg-brand-light px-4 py-3 text-xs text-slate-500">
          Este ciclo não está aberto. Ao encerrar, o vínculo entre pessoa e resposta é apagado dos
          dois lados — é o que torna o anonimato definitivo, e por isso não há mais como retratar um
          envio.
        </p>
      )}
    </Lista>
  );
}
