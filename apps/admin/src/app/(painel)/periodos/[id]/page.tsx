/**
 * Configuração de um ciclo anual.
 *
 * A ordem da tela segue a ordem real do trabalho: escolher os semestres do ano,
 * escolher os formulários por público, ajustar datas e mensagens, gerar as
 * tarefas e só então abrir. Cada passo mostra o que falta para o seguinte.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import {
  salvarCiclo,
  alternarSemestre,
  alternarFormulario,
  gerarAlvos,
  abrirCiclo,
  encerrarCiclo,
  publicarResultados,
  duplicarCiclo,
} from '../actions';

export const dynamic = 'force-dynamic';

const PUBLICO: Record<string, string> = {
  ALUNO: 'Discentes',
  PROFESSOR: 'Docentes',
  TECNICO_ADMIN: 'Técnico-administrativo',
};

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  RASCUNHO: { rotulo: 'rascunho', classe: 'bg-slate-100 text-slate-500' },
  AGENDADO: { rotulo: 'agendado', classe: 'bg-brand-blue/10 text-brand-blue' },
  ABERTO: { rotulo: 'aberto', classe: 'bg-brand-teal/10 text-brand-teal-hover' },
  ENCERRADO: { rotulo: 'encerrado', classe: 'bg-brand-orange/10 text-brand-orange' },
  PUBLICADO: { rotulo: 'resultados publicados', classe: 'bg-brand-navy/10 text-brand-navy' },
};

const btn =
  'rounded-lg border border-brand-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover disabled:opacity-40';
const btnPrimario =
  'rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover';
const campo =
  'w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal';

const paraInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export default async function Ciclo({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const ciclo = await prisma.evaluationPeriod
    .findUnique({
      where: { id },
      include: {
        term: true,
        semestres: { include: { term: true } },
        formularios: { include: { form: true } },
        _count: { select: { tarefas: true } },
      },
    })
    .catch(() => null);

  if (!ciclo) notFound();

  const [semestresDoAno, formularios, concluidas, alvos] = await Promise.all([
    prisma.academicTerm.findMany({ where: { ano: ciclo.ano }, orderBy: { semestre: 'asc' } }),
    prisma.formTemplate.findMany({ orderBy: { publico: 'asc' } }),
    prisma.evaluationTask.count({ where: { periodId: id, status: 'CONCLUIDA' } }),
    prisma.evaluationTaskTarget.count({ where: { task: { periodId: id } } }),
  ]);

  const conteudoEditavel = ciclo.status === 'RASCUNHO';
  const ajustavel = ['RASCUNHO', 'AGENDADO', 'ABERTO'].includes(ciclo.status);
  const st = STATUS[ciclo.status] ?? STATUS.RASCUNHO;
  const semestresLigados = new Set(ciclo.semestres.map((s) => s.termId));
  const formsLigados = new Set(ciclo.formularios.map((f) => f.formId));

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <Link href="/periodos" className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover">
        ← Ciclos
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${st.classe}`}>
            {st.rotulo}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
            ciclo {ciclo.ano}
          </span>
        </div>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">{ciclo.nome}</h1>
        {!conteudoEditavel && (
          <p className="mt-2 text-sm text-brand-orange">
            {ciclo.status === 'ABERTO'
              ? 'Ciclo aberto: semestres e formulários estão congelados. Ainda dá para ajustar datas e mensagens.'
              : 'Este ciclo faz parte da série histórica e não é mais alterado. Duplique-o para o próximo ano.'}
          </p>
        )}
      </header>

      {/* -------------------------------------------------------- resumo */}
      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-100 sm:grid-cols-4">
        {[
          ['Semestres', ciclo.semestres.map((s) => s.term.codigo).join(' + ') || '—'],
          ['Respondentes', ciclo._count.tarefas.toLocaleString('pt-BR')],
          ['Cards gerados', alvos.toLocaleString('pt-BR')],
          ['Responderam', concluidas.toLocaleString('pt-BR')],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="bg-white px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{rotulo}</dt>
            <dd className="mt-1 font-brand text-lg font-semibold text-brand-navy tabular-nums">{valor}</dd>
          </div>
        ))}
      </dl>

      {concluidas > 0 && (
        <p className="mt-3 text-right">
          <Link
            href={`/periodos/${ciclo.id}/respondentes`}
            className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
          >
            Ver quem respondeu — e liberar novo envio →
          </Link>
        </p>
      )}

      {/* --------------------------------------------------- 1. semestres */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">1</span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">Semestres do ano</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          O aluno responde sobre o que cursa agora e sobre o que cursou nos outros semestres marcados.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {semestresDoAno.length === 0 && (
            <p className="text-sm text-brand-orange">
              Nenhum semestre de {ciclo.ano} importado do JACAD.
            </p>
          )}
          {semestresDoAno.map((t) => {
            const ligado = semestresLigados.has(t.id);
            return (
              <form key={t.id}>
                <input type="hidden" name="periodId" value={ciclo.id} />
                <button
                  formAction={alternarSemestre.bind(null, t.id)}
                  disabled={!conteudoEditavel}
                  className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                    ligado
                      ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                      : 'border-brand-navy/15 bg-white text-slate-400'
                  } ${conteudoEditavel ? 'hover:border-brand-teal/60' : 'cursor-default opacity-70'}`}
                >
                  {ligado ? '✓ ' : ''}
                  {t.codigo}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      {/* -------------------------------------------------- 2. formulários */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">2</span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">Formulários</h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">Um por público. Só formulários publicados devem ir a um ciclo aberto.</p>

        <ul className="mt-4 flex flex-col gap-2">
          {formularios.map((f) => {
            const ligado = formsLigados.has(f.id);
            return (
              <li key={f.id}>
                <form className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-3">
                  <input type="hidden" name="periodId" value={ciclo.id} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {PUBLICO[f.publico] ?? f.publico}
                      </span>
                      {f.status !== 'PUBLICADO' && (
                        <span className="rounded bg-brand-orange/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-orange">
                          {f.status.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-semibold text-brand-navy">{f.nome}</p>
                  </div>
                  <button
                    formAction={alternarFormulario.bind(null, f.id)}
                    disabled={!conteudoEditavel}
                    className={ligado ? `${btn} border-brand-teal text-brand-teal-hover` : btn}
                  >
                    {ligado ? '✓ incluído' : 'incluir'}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      {/* --------------------------------------------- 3. datas e mensagens */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">3</span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">Janela e mensagens</h2>
        </div>

        <form className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
          <input type="hidden" name="periodId" value={ciclo.id} />
          <input name="nome" defaultValue={ciclo.nome} className={campo} aria-label="Nome do ciclo" disabled={!ajustavel} />
          <textarea name="descricao" defaultValue={ciclo.descricao ?? ''} rows={2} placeholder="Descrição (opcional)" className={campo} disabled={!ajustavel} />

          <div className="flex flex-wrap gap-3">
            <label className="text-xs text-slate-500">
              Abre em
              <input type="datetime-local" name="abreEm" defaultValue={paraInput(ciclo.abreEm)} className={`${campo} mt-1`} disabled={!ajustavel} />
            </label>
            <label className="text-xs text-slate-500">
              Fecha em
              <input type="datetime-local" name="fechaEm" defaultValue={paraInput(ciclo.fechaEm)} className={`${campo} mt-1`} disabled={!ajustavel} />
            </label>
            <label className="text-xs text-slate-500" title="Alvos com menos respostas que isto não têm média exibida">
              Mínimo p/ exibir resultado
              <input type="number" name="minimoRespostasExibicao" min={1} defaultValue={ciclo.minimoRespostasExibicao} className={`${campo} mt-1 w-40`} disabled={!ajustavel} />
            </label>
          </div>

          <textarea name="mensagemBoasVindas" defaultValue={ciclo.mensagemBoasVindas ?? ''} rows={2} placeholder="Mensagem de abertura mostrada ao respondente" className={campo} disabled={!ajustavel} />
          <textarea name="mensagemConclusao" defaultValue={ciclo.mensagemConclusao ?? ''} rows={2} placeholder="Mensagem de agradecimento ao concluir" className={campo} disabled={!ajustavel} />

          {ajustavel && (
            <div>
              <button formAction={salvarCiclo} className={btnPrimario}>
                Salvar
              </button>
            </div>
          )}
        </form>
      </section>

      {/* ------------------------------------------------------ 4. liberar */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">4</span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">Liberar e encerrar</h2>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <form>
              <input type="hidden" name="periodId" value={ciclo.id} />
              <button formAction={gerarAlvos} disabled={!conteudoEditavel} className={btn}>
                Gerar tarefas e cards
              </button>
            </form>
            <form>
              <input type="hidden" name="periodId" value={ciclo.id} />
              <button
                formAction={abrirCiclo}
                disabled={!['RASCUNHO', 'AGENDADO'].includes(ciclo.status) || ciclo._count.tarefas === 0}
                className={btnPrimario}
                title={ciclo._count.tarefas === 0 ? 'Gere as tarefas antes de abrir' : undefined}
              >
                Abrir para os respondentes
              </button>
            </form>
            <form>
              <input type="hidden" name="periodId" value={ciclo.id} />
              <button formAction={encerrarCiclo} disabled={ciclo.status !== 'ABERTO'} className={btn}>
                Encerrar coleta
              </button>
            </form>
            <form>
              <input type="hidden" name="periodId" value={ciclo.id} />
              <button formAction={publicarResultados} disabled={ciclo.status !== 'ENCERRADO'} className={btn}>
                Publicar resultados
              </button>
            </form>
          </div>

          <p className="text-xs text-slate-400">
            Gerar recalcula os cards a partir das matrículas atuais e não mexe em quem já respondeu.
            Depois de aberto, semestres e formulários ficam congelados.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------- próximo ciclo */}
      <section className="mt-10 rounded-2xl border border-dashed border-brand-navy/25 bg-white/60 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Próximo ano
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Duplica semestres, formulários, mensagens e k-anonimato para um novo ciclo. Este aqui
          permanece intacto como histórico.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="origemId" value={ciclo.id} />
          <label className="text-xs text-slate-500">
            Ano
            <input type="number" name="ano" defaultValue={ciclo.ano + 1} min={2000} max={2100} className={`${campo} mt-1 w-32`} />
          </label>
          <button formAction={duplicarCiclo} className={btn}>
            Duplicar para o novo ano
          </button>
        </form>
      </section>
    </div>
  );
}
