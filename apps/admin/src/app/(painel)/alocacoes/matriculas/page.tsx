import Link from 'next/link';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { SelecionarTodos } from '@/components/SelecionarTodos';
import { alternarAluno, definirStatusEmLote } from './actions';
import { FILTROS, lerFiltro, montarWhere } from './filtro';

export const dynamic = 'force-dynamic';

/** Id do formulário de lote — as caixas da tabela o alcançam por `form=`. */
const LOTE = 'lote-matriculas';

const btn =
  'rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover';

export default async function Matriculas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const filtro = lerFiltro(typeof sp.f === 'string' ? sp.f : '');

  // `ok` volta da ação com números: situação aplicada, alterados, sem e-mail,
  // e quantos já estavam assim.
  const [okSituacao, okAlterados, okSemEmail, okJaEstavam] = (
    typeof sp.ok === 'string' ? sp.ok : ''
  ).split('.');
  const resumo =
    okSituacao === 'ATIVO' || okSituacao === 'INATIVO'
      ? {
          situacao: okSituacao,
          alterados: Number(okAlterados) || 0,
          semEmail: Number(okSemEmail) || 0,
          jaEstavam: Number(okJaEstavam) || 0,
        }
      : null;

  const where = montarWhere(q, filtro);

  const [total, matriculas, contagens] = await Promise.all([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      orderBy: [{ class: { nome: 'asc' } }, { student: { nome: 'asc' } }],
      skip: pular,
      take: POR_PAGINA,
      include: {
        student: {
          select: {
            id: true,
            nome: true,
            matricula: true,
            status: true,
            email: true,
            _count: { select: { inscricoesDisciplina: true } },
          },
        },
        class: {
          select: {
            nome: true,
            turno: true,
            course: { select: { nome: true } },
            term: { select: { codigo: true } },
          },
        },
      },
    }),
    // Contagem de cada aba, sem a busca: o número diz quanto existe, não
    // quanto sobrou depois de digitar.
    Promise.all(FILTROS.map((f) => prisma.enrollment.count({ where: montarWhere('', f.chave) }))),
  ]);

  // A página só volta junto na aba "Todas", onde a lista não encolhe com a
  // ação. Nas outras, ativar um aluno o tira da aba — e voltar à página 3 de
  // uma lista que agora tem duas devolveria uma tela vazia.
  const volta = `/alocacoes/matriculas?${new URLSearchParams({
    ...(filtro ? { f: filtro } : {}),
    ...(q ? { q } : {}),
    ...(!filtro && pagina > 1 ? { p: String(pagina) } : {}),
  })}`;

  return (
    <Lista
      eyebrow="Vínculos"
      titulo="Matrículas"
      descricao="Aluno × turma. A coluna de disciplinas mostra em quantas ofertas o aluno está inscrito — é o número de cards de professor que ele receberá."
      buscaPlaceholder="Buscar por aluno, RA ou turma…"
      q={q}
      pagina={pagina}
      total={total}
      href="/alocacoes/matriculas"
      parametros={filtro ? { f: filtro } : {}}
      colunas={[
        { titulo: <SelecionarTodos formulario={LOTE} />, estreita: true },
        { titulo: 'RA', estreita: true },
        { titulo: 'Aluno' },
        { titulo: 'Turma' },
        { titulo: 'Curso' },
        { titulo: 'Semestre', estreita: true },
        { titulo: 'Disciplinas', numerica: true, estreita: true },
        { titulo: '', estreita: true },
      ]}
      linhas={matriculas.map((m) => [
        <input
          key="sel"
          type="checkbox"
          name="ids"
          value={m.id}
          form={LOTE}
          aria-label="Selecionar matrícula"
          className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--color-brand-teal)]"
        />,
        <span className="font-mono text-xs text-slate-400">{m.student.matricula}</span>,
        <span className="font-medium">
          {m.student.nome}
          {m.student.status !== 'ATIVO' && (
            <span className="ml-2">
              <Etiqueta tom="apagado">{m.student.status.toLowerCase()}</Etiqueta>
            </span>
          )}
          {!m.ativo && (
            <span className="ml-2">
              <Etiqueta tom="alerta">matrícula inativa</Etiqueta>
            </span>
          )}
        </span>,
        <span className="text-slate-500">{m.class.nome}</span>,
        m.class.course.nome,
        <span className="font-mono text-xs text-slate-400">{m.class.term.codigo}</span>,
        m.student._count.inscricoesDisciplina,
        <form key="acao">
          <input type="hidden" name="volta" value={volta} />
          <button
            formAction={alternarAluno.bind(null, m.student.id)}
            className={btn}
            title={
              m.student.status === 'ATIVO'
                ? 'Tira o aluno das próximas gerações de tarefa'
                : 'Habilita o aluno para entrar em um ciclo'
            }
          >
            {m.student.status === 'ATIVO' ? 'Inativar' : 'Ativar'}
          </button>
        </form>,
      ])}
    >
      {resumo && (
        <p className="mt-6 rounded-2xl border border-brand-teal/30 bg-brand-teal/5 px-5 py-3 text-sm text-brand-navy">
          <strong className="font-semibold text-brand-teal-hover">
            {resumo.alterados.toLocaleString('pt-BR')}{' '}
            {resumo.alterados === 1
              ? resumo.situacao === 'ATIVO'
                ? 'aluno ativado'
                : 'aluno inativado'
              : resumo.situacao === 'ATIVO'
                ? 'alunos ativados'
                : 'alunos inativados'}
            .
          </strong>
          {resumo.jaEstavam > 0 && (
            <> {resumo.jaEstavam.toLocaleString('pt-BR')} já estavam assim.</>
          )}
          {resumo.semEmail > 0 && (
            <>
              {' '}
              <span className="text-brand-orange">
                {resumo.semEmail.toLocaleString('pt-BR')} ficaram de fora por não terem e-mail real
              </span>{' '}
              — informe o e-mail em Cadastros → Usuários antes de ativar.
            </>
          )}
          {resumo.situacao === 'ATIVO' && resumo.alterados > 0 && (
            <>
              {' '}
              Quem foi ativado não entra sozinho no ciclo aberto: use{' '}
              <em>Incluir quem ficou de fora</em> na lista de respondentes do ciclo.
            </>
          )}
        </p>
      )}

      {/* ---------------------------------------------------------- abas */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTROS.map((aba, i) => {
          const ativa = filtro === aba.chave;
          const n = contagens[i];
          const alerta = aba.chave !== '' && n > 0;
          return (
            <Link
              key={aba.chave || 'todas'}
              href={`/alocacoes/matriculas${aba.chave ? `?f=${aba.chave}` : ''}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                ativa
                  ? alerta
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                  : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
              }`}
            >
              {aba.rotulo}{' '}
              <span className="font-normal tabular-nums text-slate-400">
                {n.toLocaleString('pt-BR')}
              </span>
            </Link>
          );
        })}
      </div>

      {/* ------------------------------------------------- edição em lote */}
      <form
        id={LOTE}
        className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4"
      >
        <input type="hidden" name="volta" value={volta} />
        <input type="hidden" name="q" value={q} />
        <input type="hidden" name="f" value={filtro} />

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-brand-navy">Situação do aluno em lote</p>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Marque as linhas, ou aplique a tudo que casa com a aba e a busca atuais — inclusive o
            que está em outras páginas. A mudança vale para o aluno, não para a turma: quem tem
            duas matrículas muda uma vez só, e a próxima importação do JACAD respeita o que você
            decidiu aqui.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            formAction={definirStatusEmLote.bind(null, 'ATIVO', 'marcadas')}
            className="rounded-lg bg-brand-teal px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Ativar marcadas
          </button>
          <button
            formAction={definirStatusEmLote.bind(null, 'INATIVO', 'marcadas')}
            className={btn}
          >
            Inativar marcadas
          </button>
          {/* Só com um recorte ativo: em "Todas", sem busca, o rótulo seria
              "ativar as 1.891" — um clique a uma matrícula de distância de
              reativar quem o JACAD marcou como inativo de propósito. */}
          {(filtro || q) && (
            <button
              formAction={definirStatusEmLote.bind(null, 'ATIVO', 'filtro')}
              className="rounded-lg border border-brand-teal/50 px-3 py-1.5 text-[11px] font-semibold text-brand-teal-hover transition-colors hover:bg-brand-teal/10"
              title="Ignora a seleção e aplica a tudo que casa com a aba e a busca atuais"
            >
              Ativar as {total.toLocaleString('pt-BR')} do filtro
            </button>
          )}
        </div>
      </form>
    </Lista>
  );
}
