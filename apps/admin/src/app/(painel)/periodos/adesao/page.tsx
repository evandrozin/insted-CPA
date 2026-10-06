/**
 * Adesão ao vivo — quem já respondeu, enquanto o ciclo está aberto.
 *
 * É a tela da campanha: serve para decidir onde cobrar. Por isso a lista de
 * turmas vem das piores para as melhores, e não em ordem alfabética — o que
 * interessa é a turma onde ninguém respondeu.
 *
 * Fala de TAREFAS, não de respostas: nomeia curso e turma porque está contando
 * quem recebeu e quem enviou, nunca o que foi respondido.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { Atualizando } from '@/components/Atualizando';
import {
  adesaoPorCurso,
  adesaoPorPerfil,
  adesaoPorTurma,
  enviosPorDia,
  resumoDeAdesao,
  type FatiaDeAdesao,
} from '@/lib/adesao';

export const dynamic = 'force-dynamic';

const numero = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const pct = (f: FatiaDeAdesao) =>
  f.tarefas > 0 ? Math.round((f.concluidas / f.tarefas) * 100) : 0;

const PERFIL: Record<string, string> = {
  ALUNO: 'Discentes',
  PROFESSOR: 'Docentes',
  TECNICO_ADMIN: 'Técnico-administrativo',
  GESTOR: 'Coordenação',
  ADMIN: 'Administração',
};

const cartao = 'rounded-2xl border border-brand-navy/10 bg-white px-5 py-5';
const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400';

export default async function Adesao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPainel();
  const sp = await searchParams;
  const escolhido = typeof sp.ciclo === 'string' ? sp.ciclo : '';

  const ciclos = await prisma.evaluationPeriod.findMany({
    orderBy: [{ status: 'asc' }, { ano: 'desc' }],
    select: { id: true, nome: true, ano: true, status: true, fechaEm: true },
  });

  if (ciclos.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
        <h1 className="font-brand text-3xl font-bold text-brand-navy">Adesão ao vivo</h1>
        <p className="mt-4 text-sm text-slate-500">
          Nenhum ciclo cadastrado.{' '}
          <Link href="/periodos" className="font-semibold text-brand-teal">
            Criar o primeiro →
          </Link>
        </p>
      </div>
    );
  }

  // Sem escolha, o ciclo aberto: é o único em que acompanhar faz diferença.
  const ciclo =
    ciclos.find((c) => c.id === escolhido) ?? ciclos.find((c) => c.status === 'ABERTO') ?? ciclos[0];

  const [resumo, cursos, turmas, perfis, porDia] = await Promise.all([
    resumoDeAdesao(ciclo.id),
    adesaoPorCurso(ciclo.id),
    adesaoPorTurma(ciclo.id),
    adesaoPorPerfil(ciclo.id),
    enviosPorDia(ciclo.id),
  ]);

  const diasRestantes = Math.ceil((ciclo.fechaEm.getTime() - Date.now()) / 86_400_000);
  const foraDoRecorte = resumo.tarefas - cursos.reduce((t, c) => t + c.tarefas, 0);
  const pico = Math.max(1, ...porDia.map((d) => d.total));

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 lg:px-8">
      <header>
        <p className={eyebrow}>Avaliação</p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Adesão ao vivo
        </h1>
        <p className="mt-2 text-slate-500">
          {ciclo.nome} · ciclo {ciclo.status.toLowerCase()}
          {ciclo.status === 'ABERTO' &&
            (diasRestantes > 0
              ? ` · ${diasRestantes} ${diasRestantes === 1 ? 'dia restante' : 'dias restantes'}`
              : ' · prazo encerrado')}
        </p>

        <div className="mt-3">
          <Atualizando />
        </div>

        {ciclos.length > 1 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {ciclos.map((c) => (
              <Link
                key={c.id}
                href={`/periodos/adesao?ciclo=${c.id}`}
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

      {/* ----------------------------------------------------------- resumo */}
      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Adesão', valor: `${resumo.percentual}%` },
          { rotulo: 'Enviaram', valor: numero(resumo.concluidas) },
          { rotulo: 'Começaram', valor: numero(resumo.emAndamento) },
          { rotulo: 'Nem abriram', valor: numero(resumo.pendentes) },
        ].map((c) => (
          <div key={c.rotulo} className={cartao}>
            <p className="font-brand text-2xl font-bold tabular-nums text-brand-navy">{c.valor}</p>
            <p className={`mt-1 ${eyebrow}`}>{c.rotulo}</p>
          </div>
        ))}
      </section>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-teal transition-all"
          style={{ width: `${resumo.percentual}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {numero(resumo.concluidas)} de {numero(resumo.tarefas)} respondentes.{' '}
        <Link
          href={`/periodos/${ciclo.id}/respondentes?status=PENDENTE`}
          className="font-semibold text-brand-teal"
        >
          Lista nominal de quem falta →
        </Link>
      </p>

      {/* ------------------------------------------------------ envios/dia */}
      {porDia.length > 0 && (
        <section className="mt-10">
          <h2 className="font-brand text-lg font-bold text-brand-navy">Envios por dia</h2>
          <p className="mt-1 text-xs text-slate-500">
            Serve para ver o efeito de um aviso: a curva sobe no dia seguinte ao e-mail.
          </p>
          <div className="mt-4 flex items-end gap-1.5 overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white px-5 py-5">
            {porDia.map((d) => (
              <div key={d.dia.toISOString()} className="flex w-12 shrink-0 flex-col items-center gap-1">
                <span className="text-[10px] tabular-nums text-slate-400">{d.total}</span>
                <span
                  className="w-full rounded-t bg-brand-teal"
                  style={{ height: `${Math.max(4, (d.total / pico) * 120)}px` }}
                />
                <span className="text-[10px] text-slate-400">
                  {d.dia.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* --------------------------------------------------- perfil e curso */}
      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Fatias
          titulo="Por perfil"
          descricao="Quem recebeu a avaliação, por tipo de respondente."
          fatias={perfis.map((p) => ({ ...p, rotulo: PERFIL[p.rotulo] ?? p.rotulo }))}
        />
        <Fatias
          titulo="Por curso"
          descricao="Dos cursos com menor adesão para os maiores."
          fatias={cursos}
          // O recorte por curso vem da matrícula. Docente e técnico não têm
          // matrícula, então não aparecem aqui — e some um pedaço do total sem
          // que ninguém perceba. A nota só aparece quando a conta não fecha.
          rodape={
            foraDoRecorte > 0
              ? `${numero(foraDoRecorte)} respondentes sem matrícula ativa — docentes e técnicos não entram neste recorte. Veja "Por perfil".`
              : undefined
          }
        />
      </div>

      {/* ------------------------------------------------------------ turmas */}
      <section className="mt-10">
        <h2 className="font-brand text-lg font-bold text-brand-navy">Turmas que mais faltam</h2>
        <p className="mt-1 text-xs text-slate-500">
          As {turmas.length} com menor adesão. É por onde começa a cobrança.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
          <table className="w-full text-sm">
            <tbody>
              {turmas.map((t) => (
                <tr key={`${t.rotulo}-${t.detalhe}`} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="text-brand-navy">{t.rotulo}</span>
                    {t.detalhe && <span className="ml-2 text-xs text-slate-400">{t.detalhe}</span>}
                  </td>
                  <td className="w-40 px-5 py-2.5">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-brand-teal"
                        style={{ width: `${pct(t)}%` }}
                      />
                    </span>
                  </td>
                  <td className="w-28 px-5 py-2.5 text-right text-xs tabular-nums text-slate-500">
                    {numero(t.concluidas)}/{numero(t.tarefas)} · {pct(t)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Fatias({
  titulo,
  descricao,
  fatias,
  rodape,
}: {
  titulo: string;
  descricao: string;
  fatias: FatiaDeAdesao[];
  rodape?: string;
}) {
  return (
    <section>
      <h2 className="font-brand text-lg font-bold text-brand-navy">{titulo}</h2>
      <p className="mt-1 text-xs text-slate-500">{descricao}</p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
        {fatias.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Sem dados ainda.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              {fatias.map((f) => (
                <tr key={f.rotulo} className="border-b border-slate-50 last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="text-brand-navy">{f.rotulo}</span>
                    {f.detalhe && <span className="ml-2 text-xs text-slate-400">{f.detalhe}</span>}
                  </td>
                  <td className="w-28 px-5 py-2.5">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-brand-teal"
                        style={{ width: `${pct(f)}%` }}
                      />
                    </span>
                  </td>
                  <td className="w-28 px-5 py-2.5 text-right text-xs tabular-nums text-slate-500">
                    {numero(f.concluidas)}/{numero(f.tarefas)} · {pct(f)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rodape && <p className="mt-2 text-[11px] text-slate-400">{rodape}</p>}
    </section>
  );
}
