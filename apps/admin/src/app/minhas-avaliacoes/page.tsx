/**
 * Pendências do respondente.
 *
 * Primeira tela depois do login: o que falta responder, com prazo.
 */
import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { respondenteAtual } from '@/lib/sessao';
import { sair } from '../entrar/actions';

export const dynamic = 'force-dynamic';

const prazo = (d: Date) => {
  const dias = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (dias < 0) return { texto: 'prazo encerrado', urgente: true };
  if (dias === 0) return { texto: 'último dia', urgente: true };
  if (dias === 1) return { texto: 'termina amanhã', urgente: true };
  return { texto: `${dias} dias restantes`, urgente: dias <= 3 };
};

export default async function MinhasAvaliacoes() {
  const eu = await respondenteAtual();
  if (!eu) redirect('/entrar');

  const tarefas = await prisma.evaluationTask.findMany({
    where: {
      respondentId: eu.id,
      status: { not: 'DISPENSADA' },
      period: { status: { in: ['ABERTO', 'ENCERRADO', 'PUBLICADO'] } },
    },
    include: {
      period: { select: { nome: true, ano: true, fechaEm: true, status: true } },
      _count: { select: { alvos: true } },
    },
    orderBy: { period: { fechaEm: 'asc' } },
  });

  const pendentes = tarefas.filter((t) => t.status !== 'CONCLUIDA' && t.period.status === 'ABERTO');
  const feitas = tarefas.filter((t) => t.status === 'CONCLUIDA');

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Image
          src="/logo-insted.png"
          alt="Insted Centro Universitário"
          width={550}
          height={162}
          className="h-8 w-auto"
          priority
        />
        <form>
          <span className="mr-3 text-xs text-slate-500">{eu.nome}</span>
          <button
            formAction={sair}
            className="rounded-lg border border-brand-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
          >
            Sair
          </button>
        </form>
      </header>

      <h1 className="mt-10 font-brand text-2xl font-bold tracking-tight text-brand-navy">
        Suas avaliações
      </h1>

      {pendentes.length === 0 && feitas.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-brand-navy/25 bg-white/60 px-5 py-10 text-center">
          <p className="font-medium text-brand-navy">Nada pendente por enquanto.</p>
          <p className="mt-2 text-sm text-slate-500">
            Quando a CPA abrir um ciclo de avaliação, ele aparece aqui.
          </p>
        </div>
      )}

      {pendentes.length > 0 && (
        <ul className="mt-6 flex flex-col gap-3">
          {pendentes.map((t) => {
            const p = prazo(t.period.fechaEm);
            return (
              <li key={t.id}>
                <Link
                  href={`/responder/${t.id}`}
                  className="relative block overflow-hidden rounded-2xl border border-brand-navy/10 bg-white px-5 py-5 transition-colors hover:border-brand-teal/50"
                >
                  <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-brand text-lg font-semibold text-brand-navy">
                        {t.period.nome}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {t._count.alvos} etapas · cerca de 5 minutos
                      </p>
                    </div>
                    <span
                      className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${
                        p.urgente
                          ? 'bg-brand-orange/10 text-brand-orange'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {p.texto}
                    </span>
                  </div>

                  {t.progresso > 0 && (
                    <div className="mt-4">
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-brand-teal"
                          style={{ width: `${t.progresso}%` }}
                        />
                      </div>
                      <p className="mt-1.5 text-xs text-slate-400">
                        {t.progresso}% preenchido — continue de onde parou
                      </p>
                    </div>
                  )}

                  <p className="mt-4 text-sm font-semibold text-brand-teal">
                    {t.progresso > 0 ? 'Continuar →' : 'Começar →'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {feitas.length > 0 && (
        <section className="mt-10">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Já respondidas
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {feitas.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-navy/10 bg-white px-5 py-3"
              >
                <span className="text-sm text-slate-500">{t.period.nome}</span>
                <span className="rounded bg-brand-teal/10 px-2 py-0.5 text-[11px] font-semibold text-brand-teal-hover">
                  enviada
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Suas respostas são anônimas e não podem ser alteradas depois do envio.
          </p>
        </section>
      )}
    </div>
  );
}
