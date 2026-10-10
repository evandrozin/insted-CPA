/**
 * Configuração de um ciclo anual.
 *
 * A ordem da tela segue a ordem real do trabalho: escolher os semestres do ano,
 * escolher os formulários por público, ajustar datas e mensagens, gerar as
 * tarefas e só então abrir. Cada passo mostra o que falta para o seguinte.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Prisma, prisma } from '@insted/database';
import { GeradorDeAlvos } from '@insted/avaliacao';
import { lista, montarEscopo } from '../escopo';
import {
  salvarCiclo,
  alternarSemestre,
  alternarFormulario,
  gerarAlvos,
  abrirCiclo,
  encerrarCiclo,
  publicarResultados,
  excluirCiclo,
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

export default async function Ciclo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const ciclo = await prisma.evaluationPeriod
    .findUnique({
      where: { id },
      include: {
        term: true,
        semestres: { include: { term: true } },
        formularios: { include: { form: true } },
        // Sem os retirados: "respondentes" é quem foi de fato convidado.
        _count: { select: { tarefas: { where: { status: { not: 'DISPENSADA' } } } } },
      },
    })
    .catch(() => null);

  if (!ciclo) notFound();

  const [semestresDoAno, formularios, concluidas, alvos] = await Promise.all([
    prisma.academicTerm.findMany({ where: { ano: ciclo.ano }, orderBy: { semestre: 'asc' } }),
    // Arquivado some da escolha; versão nova primeiro, para a lista não
    // depender de o leitor adivinhar qual das três é a atual.
    prisma.formTemplate.findMany({
      where: { OR: [{ status: { not: 'ARQUIVADO' } }, { periodForms: { some: { periodId: id } } }] },
      orderBy: [{ publico: 'asc' }, { nome: 'asc' }, { versao: 'desc' }],
      include: { _count: { select: { blocos: true } } },
    }),
    prisma.evaluationTask.count({ where: { periodId: id, status: 'CONCLUIDA' } }),
    prisma.evaluationTaskTarget.count({ where: { task: { periodId: id } } }),
  ]);

  const conteudoEditavel = ciclo.status === 'RASCUNHO';
  const ajustavel = ['RASCUNHO', 'AGENDADO', 'ABERTO'].includes(ciclo.status);
  const st = STATUS[ciclo.status] ?? STATUS.RASCUNHO;
  const semestresLigados = new Set(ciclo.semestres.map((s) => s.termId));
  const formsLigados = new Set(ciclo.formularios.map((f) => f.formId));

  // ───────────────────────── painel "Gerar tarefas e cards"
  const geracaoAtiva = ['RASCUNHO', 'AGENDADO', 'ABERTO'].includes(ciclo.status);
  const aberto = ciclo.status === 'ABERTO';
  const temAluno = ciclo.formularios.some((f) => f.publico === 'ALUNO');

  // A tela devolve o recorte pela URL quando o usuário pede a contagem, e é
  // dela que os campos se repovoam. Sem pedido, o padrão é todos os formulários.
  const comPrevia = sp.previa === '1';
  const fMarcados = comPrevia ? lista(sp.f) : ciclo.formularios.map((f) => f.id);
  const mMarcados = comPrevia ? lista(sp.m) : [];
  const cMarcados = comPrevia ? lista(sp.c) : [];
  const modoMarcado = sp.modo === 'recalcular' && conteudoEditavel ? 'recalcular' : 'novos';

  // Cursos com aluno ativo no semestre mais recente do ciclo, com a contagem:
  // é o que a CPA precisa ver para decidir "só estes cursos".
  const termosDoCiclo = ciclo.semestres.length > 0 ? ciclo.semestres.map((x) => x.term) : [ciclo.term];
  const semestreAtual = [...termosDoCiclo].sort(
    (a, b) => b.ano - a.ano || b.semestre - a.semestre,
  )[0];

  const cursosDisponiveis = temAluno
    ? await prisma.$queryRaw<{ id: string; nome: string; alunos: number }[]>(Prisma.sql`
        SELECT c.id, c.nome, COUNT(DISTINCT e."studentId")::int AS alunos
          FROM enrollments e
          JOIN school_classes sc ON sc.id = e."classId"
          JOIN courses c ON c.id = sc."courseId"
          JOIN users u ON u.id = e."studentId"
         WHERE e.ativo = true
           AND sc."termId" = ${semestreAtual.id}
           AND u.role = 'ALUNO' AND u.status = 'ATIVO' AND u."deletadoEm" IS NULL
           AND c.ativo = true
         GROUP BY c.id, c.nome
         ORDER BY c.nome
      `)
    : [];

  const previa =
    comPrevia && fMarcados.length > 0
      ? await new GeradorDeAlvos(prisma)
          .previa(id, montarEscopo({ formularios: fMarcados, modalidades: mMarcados, cursos: cMarcados }))
          .catch(() => null)
      : null;

  // Resultado da última geração, lido da auditoria pelo id: a URL carrega só o
  // id, e os números ficam registrados no mesmo lugar de sempre.
  const idGeracao = typeof sp.geracao === 'string' ? sp.geracao : null;
  const geracao = idGeracao
    ? await prisma.auditLog
        .findFirst({
          where: { id: idGeracao, acao: 'PERIOD_GENERATE_TARGETS', entidadeId: id },
          select: { dadosDepois: true },
        })
        .then(
          (l) =>
            (l?.dadosDepois ?? null) as {
              modo: 'novos' | 'recalcular';
              tarefas: number;
              alvos: number;
              semAlvo: number;
              avisos: string[];
              recusas: { motivo: string; total: number }[];
            } | null,
        )
        .catch(() => null)
    : null;

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

      {/* Aparece sempre que houver tarefa, e não só depois do primeiro
          envio: a lista serve principalmente para saber QUEM FALTA — que é
          exatamente a pergunta de quem vai cobrar. Escondê-la até alguém
          responder invertia a utilidade. */}
      {ciclo._count.tarefas > 0 && (
        <p className="mt-3 flex flex-wrap justify-end gap-4">
          <Link
            href={`/periodos/${ciclo.id}/respondentes`}
            className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
          >
            Lista nominal — quem respondeu e quem falta →
          </Link>
          {/* Duas telas separadas de propósito: uma diz QUEM respondeu e serve
              à cobrança; a outra, O QUE foi respondido. Não há chave ligando
              as duas, e juntá-las numa tela só convidaria a tentar. */}
          <Link
            href={`/periodos/${ciclo.id}/resultados`}
            className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
          >
            Resultados — exportar as respostas →
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
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                          f.status === 'PUBLICADO'
                            ? 'bg-brand-teal/10 text-brand-teal-hover'
                            : f.status === 'ARQUIVADO'
                              ? 'bg-slate-100 text-slate-400'
                              : 'bg-brand-orange/10 text-brand-orange'
                        }`}
                      >
                        {f.status.toLowerCase()}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-slate-400">
                        v{f.versao}
                      </span>
                      <span className="text-[10px] text-slate-400">{f._count.blocos} blocos</span>
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

          <textarea name="mensagemBoasVindas" defaultValue={ciclo.mensagemBoasVindas ?? ''} rows={8} placeholder="Mensagem de abertura mostrada ao respondente. As quebras de linha são preservadas." className={`${campo} leading-relaxed`} disabled={!ajustavel} />
          <textarea name="mensagemConclusao" defaultValue={ciclo.mensagemConclusao ?? ''} rows={4} placeholder="Mensagem de agradecimento ao concluir" className={`${campo} leading-relaxed`} disabled={!ajustavel} />

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

        {/* ---------------------------------------------- gerar tarefas */}
        <div id="gerar" className="mt-4 rounded-2xl border border-brand-navy/10 bg-white px-5 py-5">
          <p className="font-brand text-sm font-bold text-brand-navy">Gerar tarefas e cards</p>
          <p className="mt-1 max-w-2xl text-xs text-slate-500">
            Escolha para quem. Por padrão cria tarefa <strong>só para quem ainda não tem</strong>:
            quem já tem — não começou, está respondendo, enviou ou foi retirado — não é tocado, nem
            os cards, nem o rascunho.
            {aberto && ' É assim que se solta um público novo sem interromper o que está rodando.'}
          </p>

          {geracao && (
            <div className="mt-4 rounded-xl border border-brand-teal/30 bg-brand-teal/5 px-4 py-3 text-sm text-brand-navy">
              <p>
                <strong className="font-semibold text-brand-teal-hover">
                  {geracao.tarefas.toLocaleString('pt-BR')}{' '}
                  {geracao.tarefas === 1 ? 'tarefa criada' : 'tarefas criadas'}
                </strong>
                {geracao.modo === 'recalcular' && ' ou recalculadas'} ·{' '}
                {geracao.alvos.toLocaleString('pt-BR')} cards
                {geracao.semAlvo > 0 &&
                  ` · ${geracao.semAlvo.toLocaleString('pt-BR')} sem nenhum card aplicável, ficaram de fora`}
                .
              </p>
              {geracao.recusas.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-brand-orange">
                  {geracao.recusas.map((r) => (
                    <li key={r.motivo}>
                      {r.total.toLocaleString('pt-BR')} — {r.motivo}
                    </li>
                  ))}
                </ul>
              )}
              {geracao.avisos.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs text-brand-orange">
                  {geracao.avisos.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {!geracaoAtiva ? (
            <p className="mt-4 rounded-xl bg-brand-light px-4 py-3 text-xs text-slate-500">
              Este ciclo não está mais recebendo tarefas.
            </p>
          ) : (
            <form className="mt-4 flex flex-col gap-5">
              <input type="hidden" name="periodId" value={ciclo.id} />

              <fieldset>
                <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Para quais formulários
                </legend>
                <div className="mt-2 flex flex-col gap-1.5">
                  {ciclo.formularios.map((pf) => (
                    <label key={pf.id} className="flex flex-wrap items-center gap-2 text-sm text-brand-navy">
                      <input
                        type="checkbox"
                        name="f"
                        value={pf.id}
                        defaultChecked={fMarcados.includes(pf.id)}
                        className="h-3.5 w-3.5 accent-[color:var(--color-brand-teal)]"
                      />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                        {PUBLICO[pf.publico] ?? pf.publico}
                      </span>
                      {pf.form.nome}
                      <span className="font-mono text-[10px] text-slate-400">v{pf.form.versao}</span>
                    </label>
                  ))}
                  {ciclo.formularios.length === 0 && (
                    <p className="text-xs text-slate-400">Nenhum formulário neste ciclo ainda.</p>
                  )}
                </div>
              </fieldset>

              {temAluno && (
                <>
                  <fieldset>
                    <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Alunos de qual modalidade
                    </legend>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {[
                        ['PRESENCIAL', 'Presencial'],
                        ['EAD', 'EAD'],
                      ].map(([valor, rotulo]) => (
                        <label key={valor} className="flex items-center gap-2 text-sm text-brand-navy">
                          <input
                            type="checkbox"
                            name="m"
                            value={valor}
                            defaultChecked={mMarcados.includes(valor)}
                            className="h-3.5 w-3.5 accent-[color:var(--color-brand-teal)]"
                          />
                          {rotulo}
                        </label>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Sem marcar: todos. Aluno que cursa as duas aparece nas duas. Vale para
                      formulário de aluno; docentes e técnicos não têm modalidade.
                    </p>
                  </fieldset>

                  <fieldset>
                    <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                      Alunos matriculados em quais cursos
                    </legend>
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-brand-navy/10 bg-brand-light/40 px-3 py-2">
                      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                        {cursosDisponiveis.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-xs text-brand-navy">
                            <input
                              type="checkbox"
                              name="c"
                              value={c.id}
                              defaultChecked={cMarcados.includes(c.id)}
                              className="h-3.5 w-3.5 accent-[color:var(--color-brand-teal)]"
                            />
                            <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                            <span className="tabular-nums text-slate-400">{c.alunos}</span>
                          </label>
                        ))}
                        {cursosDisponiveis.length === 0 && (
                          <p className="text-xs text-slate-400">
                            Nenhum curso com aluno ativo em {semestreAtual.codigo}.
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      Sem marcar: todos os cursos. Contagem de alunos ativos em {semestreAtual.codigo}.
                    </p>
                  </fieldset>
                </>
              )}

              <fieldset>
                <legend className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  O que fazer com quem já tem tarefa
                </legend>
                <div className="mt-2 flex flex-col gap-1.5">
                  <label className="flex items-start gap-2 text-sm text-brand-navy">
                    <input
                      type="radio"
                      name="modo"
                      value="novos"
                      defaultChecked={modoMarcado === 'novos'}
                      className="mt-1 accent-[color:var(--color-brand-teal)]"
                    />
                    <span>
                      <strong className="font-semibold">Não tocar</strong> — criar só para quem
                      ainda não tem
                      <span className="block text-[11px] text-slate-400">
                        Seguro com o ciclo aberto. Nada do que existe é alterado.
                      </span>
                    </span>
                  </label>
                  <label
                    className={`flex items-start gap-2 text-sm ${
                      conteudoEditavel ? 'text-brand-navy' : 'text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="modo"
                      value="recalcular"
                      disabled={!conteudoEditavel}
                      defaultChecked={modoMarcado === 'recalcular'}
                      className="mt-1 accent-[color:var(--color-brand-orange)]"
                    />
                    <span>
                      <strong className="font-semibold">Recalcular</strong> os cards de quem já tem
                      <span className="block text-[11px]">
                        {conteudoEditavel
                          ? 'Só em rascunho: refaz os cards a partir das matrículas de agora.'
                          : 'Indisponível: com o ciclo agendado ou aberto, recalcular descartaria o rascunho de quem já começou.'}
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>

              <div className="flex flex-wrap items-center gap-2">
                {/* GET: a prévia só conta, e volta para esta mesma página com o
                    recorte na URL — nada é gravado. */}
                <button
                  type="submit"
                  formMethod="get"
                  formAction={`/periodos/${ciclo.id}#gerar`}
                  name="previa"
                  value="1"
                  className={btn}
                >
                  Contar quem receberia
                </button>
                <button formAction={gerarAlvos} className={btnPrimario}>
                  Gerar
                </button>
              </div>
            </form>
          )}

          {previa && (
            <div className="mt-5 rounded-xl border border-brand-navy/10 bg-brand-light px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Contagem — nada foi gravado
              </p>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.06em] text-slate-400">
                    <th className="py-1 font-semibold">Formulário</th>
                    <th className="py-1 text-right font-semibold">Elegíveis</th>
                    <th className="py-1 text-right font-semibold">Já têm</th>
                    <th className="py-1 text-right font-semibold">Receberiam agora</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.formularios.map((f) => (
                    <tr key={f.periodFormId} className="border-t border-brand-navy/5">
                      <td className="py-1.5 text-brand-navy">{f.nome}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">
                        {f.elegiveis.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-slate-500">
                        {f.jaTemTarefa.toLocaleString('pt-BR')}
                      </td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-brand-navy">
                        {f.novas.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {previa.semModalidade > 0 && (
                <p className="mt-2 text-xs text-brand-orange">
                  {previa.semModalidade.toLocaleString('pt-BR')} alunos ativos não têm nenhuma
                  disciplina com modalidade definida (sem disciplina, ou com disciplinas sem
                  modalidade informada): o filtro de modalidade não os alcança. Corrija nas
                  alocações docentes se algum for do recorte.
                </p>
              )}
              <p className="mt-2 text-[11px] text-slate-400">
                &ldquo;Receberiam agora&rdquo; é quem ainda não tem tarefa. Alguém sem nenhum card
                aplicável pode ficar de fora na geração.
              </p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
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
            Gerar, por padrão, só cria tarefa para quem ainda não tem — não toca em quem já existe.
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

      {/* ------------------------------------------------------- excluir */}
      {/* Fechado por padrão e com o nome digitado: um clique errado aqui
          levaria junto as tarefas e os cards de todo mundo. Ciclo com
          resposta a ação recusa, qualquer que seja o que foi digitado. */}
      <details className="mt-6 rounded-2xl border border-brand-orange/30 bg-white px-5 py-4">
        <summary className="cursor-pointer text-xs font-semibold text-brand-orange">
          Excluir este ciclo
        </summary>

        <p className="mt-3 text-sm text-slate-500">
          Apaga o ciclo e tudo que depende dele: {ciclo._count.tarefas.toLocaleString('pt-BR')}{' '}
          tarefas, os cards gerados e o vínculo com os formulários. Os formulários em si não são
          tocados.
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Serve para ciclo criado por engano. Se já houver resposta enviada, a exclusão é recusada:
          resposta anônima apagada não tem como ser pedida de novo. Para fechar um ciclo que já
          rodou, use <strong>Encerrar</strong>.
        </p>

        <form className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="periodId" value={ciclo.id} />
          <label className="text-xs text-slate-500">
            Digite o nome do ciclo para confirmar
            <input
              name="confirmacao"
              placeholder={ciclo.nome}
              autoComplete="off"
              className={`${campo} mt-1 w-80`}
            />
          </label>
          <button
            formAction={excluirCiclo}
            className="rounded-lg border border-brand-orange/40 bg-white px-3 py-2 text-xs font-semibold text-brand-orange transition-colors hover:bg-brand-orange/5"
          >
            Excluir ciclo
          </button>
        </form>
      </details>
    </div>
  );
}
