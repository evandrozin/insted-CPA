import Link from 'next/link';
import { prisma } from '@insted/database';
import { normalizarNome } from '@insted/jacad';
import { Etiqueta } from '@/components/Lista';
import {
  dataBR,
  lerCandidatos,
  mascararCpf,
  semDadosCarregados,
  tituloDoNome,
  unicoComEmail,
} from '@/lib/docentes-ambiguos';
import { resolverDocente } from './actions';

export const dynamic = 'force-dynamic';

const COMANDO = 'npm run homolog -- jacad conciliar-docentes --so-ambiguos';

const cartao = 'rounded-2xl border border-brand-navy/10 bg-white';
const campo =
  'rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-xs text-brand-navy outline-none focus:border-brand-teal';

export default async function DocentesAmbiguos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const aba = sp.f === 'resolvidos' ? 'resolvidos' : 'pendentes';
  const resolvidoAgora = typeof sp.ok === 'string' ? sp.ok : '';

  const [pendentes, resolvidos, professores] = await Promise.all([
    prisma.jacadDocenteConciliacao.findMany({
      where: { status: 'AMBIGUO' },
      orderBy: { nomeOriginal: 'asc' },
    }),
    prisma.jacadDocenteConciliacao.findMany({
      where: { status: 'MANUAL' },
      orderBy: { conciliadoEm: 'desc' },
    }),
    prisma.user.findMany({
      where: { role: 'PROFESSOR', deletadoEm: null },
      select: { id: true, nome: true, matricula: true, status: true, email: true },
    }),
  ]);

  // O cadastro de cada nome pendente e o que ele leciona: é o que ajuda a
  // reconhecer a pessoa ("ah, é a que dá Direito Civil no noturno").
  const porNome = new Map(professores.map((p) => [normalizarNome(p.nome), p]));
  const idsDocentes = pendentes
    .map((c) => porNome.get(c.nomeNormalizado)?.id)
    .filter((x): x is string => Boolean(x));

  const alocacoes = idsDocentes.length
    ? await prisma.teachingAssignment.findMany({
        where: { teacherId: { in: idsDocentes }, ativo: true },
        orderBy: [{ term: { codigo: 'desc' } }, { subject: { nome: 'asc' } }],
        select: {
          teacherId: true,
          subject: { select: { nome: true } },
          class: { select: { nome: true, course: { select: { nome: true } } } },
          term: { select: { codigo: true } },
          _count: { select: { alunos: true } },
        },
      })
    : [];
  const alocPorDocente = new Map<string, typeof alocacoes>();
  for (const a of alocacoes) {
    alocPorDocente.set(a.teacherId, [...(alocPorDocente.get(a.teacherId) ?? []), a]);
  }

  const precisaCarregar = pendentes.some((c) => semDadosCarregados(lerCandidatos(c.candidatos)));

  const aba_ = (chave: 'pendentes' | 'resolvidos', rotulo: string, n: number) => (
    <Link
      key={chave}
      href={chave === 'pendentes' ? '/cadastros/docentes-ambiguos' : '?f=resolvidos'}
      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        aba === chave
          ? chave === 'pendentes' && n > 0
            ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
            : 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
          : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
      }`}
    >
      {rotulo} <span className="font-normal tabular-nums text-slate-400">{n}</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Cadastros
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Docentes ambíguos
        </h1>
        <p className="mt-2 max-w-3xl text-slate-500">
          O JACAD tem mais de um perfil com o mesmo nome — homônimos ou cadastros duplicados. O
          sistema não escolhe sozinho, porque mandar a avaliação de um professor para outra pessoa
          é o pior erro possível. Enquanto isso o docente fica <strong>sem acesso</strong>: não
          entra, não recebe a avaliação de docentes e não vê o próprio relatório. Os alunos
          continuam avaliando normalmente.
        </p>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">
          Escolha o perfil certo e confirme. O cadastro do docente é ativado <strong>no mesmo
          registro</strong>: as turmas e as respostas dele ficam como estão.
        </p>
      </header>

      {resolvidoAgora && (
        <div className="mt-6 rounded-2xl border border-brand-teal/30 bg-brand-teal/5 px-5 py-3 text-sm text-brand-navy">
          <strong className="font-semibold text-brand-teal-hover">{resolvidoAgora}</strong> foi
          ativado(a). Já pode entrar e, no ciclo de docentes, receber a avaliação.
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {aba_('pendentes', 'Pendentes', pendentes.length)}
        {aba_('resolvidos', 'Resolvidos', resolvidos.length)}
      </div>

      {precisaCarregar && aba === 'pendentes' && (
        <section className="mt-6 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-5 py-4">
          <p className="text-sm font-semibold text-brand-orange">
            Faltam e-mail e CPF dos perfis para decidir
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Esses dados vêm da API do JACAD, que o servidor do painel normalmente não alcança.
            Carregue-os de uma máquina com o IP liberado — só reconsulta os nomes ambíguos, não
            mexe nos já resolvidos:
          </p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-brand-navy px-3 py-2 text-xs text-white">
            {COMANDO}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Depois, recarregue esta página. Sem eles dá para escolher pelo número do perfil, mas
            só com cargo e situação é difícil distinguir duas pessoas.
          </p>
        </section>
      )}

      {/* ----------------------------------------------------------- pendentes */}
      {aba === 'pendentes' && (
        <div className="mt-6 space-y-5">
          {pendentes.length === 0 && (
            <p className={`${cartao} px-5 py-8 text-center text-sm text-slate-500`}>
              Nenhum docente ambíguo. Todos os nomes do JACAD foram conciliados.
            </p>
          )}

          {pendentes.map((c) => {
            const candidatos = lerCandidatos(c.candidatos);
            const docente = porNome.get(c.nomeNormalizado);
            const aloc = docente ? (alocPorDocente.get(docente.id) ?? []) : [];
            const alunos = aloc.reduce((t, a) => t + a._count.alunos, 0);
            const sugerido = unicoComEmail(candidatos);

            return (
              <section key={c.nomeNormalizado} className={`${cartao} px-5 py-5`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-brand text-lg font-bold text-brand-navy">
                    {tituloDoNome(c.nomeOriginal)}
                  </h2>
                  <p className="text-xs text-slate-500 tabular-nums">
                    {aloc.length} {aloc.length === 1 ? 'alocação' : 'alocações'} ·{' '}
                    {alunos.toLocaleString('pt-BR')} alunos inscritos
                  </p>
                </div>

                {!docente ? (
                  <p className="mt-2 text-xs text-brand-orange">
                    Não há cadastro de docente com este nome no CPA — rode a importação antes de
                    resolver.
                  </p>
                ) : (
                  aloc.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
                      {aloc.slice(0, 5).map((a, i) => (
                        <li key={i}>
                          <span className="text-brand-navy">{a.subject.nome}</span> ·{' '}
                          {a.class.nome} · {a.class.course.nome}{' '}
                          <span className="font-mono text-slate-400">{a.term.codigo}</span>
                        </li>
                      ))}
                      {aloc.length > 5 && (
                        <li className="text-slate-400">e mais {aloc.length - 5}…</li>
                      )}
                    </ul>
                  )
                )}

                <form className="mt-4 space-y-2">
                  <fieldset className="space-y-2">
                    <legend className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                      Qual perfil é o docente?
                    </legend>
                    {candidatos.map((p) => (
                      <label
                        key={p.idPerfil}
                        className="flex cursor-pointer items-start gap-3 rounded-xl border border-brand-navy/10 px-4 py-3 transition-colors hover:border-brand-teal/40 has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal/5"
                      >
                        <input
                          type="radio"
                          name="idPerfil"
                          value={p.idPerfil}
                          required
                          disabled={!docente}
                          className="mt-1 accent-[color:var(--color-brand-teal)]"
                        />
                        <span className="min-w-0 flex-1 text-sm">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-slate-400">#{p.idPerfil}</span>
                            <span className="font-medium text-brand-navy">
                              {p.cargo ?? 'sem cargo'}
                            </span>
                            {p.status && p.status !== 'ATIVO' && (
                              <Etiqueta tom="alerta">perfil {p.status.toLowerCase()}</Etiqueta>
                            )}
                            {sugerido === p.idPerfil && (
                              <Etiqueta tom="ok">único com e-mail</Etiqueta>
                            )}
                            {!p.temEmail && <Etiqueta tom="apagado">sem e-mail no JACAD</Etiqueta>}
                          </span>
                          {p.email !== undefined ? (
                            <span className="mt-1 block text-xs text-slate-500">
                              {p.email ?? 'sem e-mail'} · CPF{' '}
                              <span className="font-mono">{mascararCpf(p.cpf)}</span>
                              {p.dataNascimento && <> · nasc. {dataBR(p.dataNascimento)}</>}
                            </span>
                          ) : (
                            <span className="mt-1 block text-xs text-slate-400">
                              dados do perfil ainda não carregados
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </fieldset>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                    <input
                      name="email"
                      type="email"
                      placeholder="e-mail institucional (se o perfil não tiver)"
                      className={`${campo} min-w-64 flex-1`}
                    />
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        name="semEmail"
                        className="accent-[color:var(--color-brand-teal)]"
                      />
                      sem e-mail (entra só pelo link do portal)
                    </label>
                    <button
                      disabled={!docente}
                      formAction={resolverDocente.bind(null, c.nomeNormalizado)}
                      className="rounded-lg bg-brand-teal px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Confirmar docente
                    </button>
                  </div>
                </form>
              </section>
            );
          })}
        </div>
      )}

      {/* ---------------------------------------------------------- resolvidos */}
      {aba === 'resolvidos' && (
        <div className={`${cartao} mt-6 overflow-x-auto`}>
          {resolvidos.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-slate-500">
              Nenhum docente resolvido por esta tela ainda.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Docente', 'Perfil', 'E-mail', 'Resolvido'].map((t) => (
                    <th
                      key={t}
                      className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400"
                    >
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolvidos.map((c) => (
                  <tr key={c.nomeNormalizado} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-brand-navy">
                      {tituloDoNome(c.nomeOriginal)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-500">
                      #{c.idPerfil ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">
                      {c.email?.endsWith('@sem-email.insted.local') ? (
                        <Etiqueta tom="apagado">só pelo portal</Etiqueta>
                      ) : (
                        (c.email ?? '—')
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500">{c.observacao ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
