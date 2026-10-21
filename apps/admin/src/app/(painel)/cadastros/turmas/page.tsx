import Link from 'next/link';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { SelecionarTodos } from '@/components/SelecionarTodos';
import { alternarTurma, definirTurmasEmLote } from './actions';
import { FILTROS, lerFiltro, montarWhere } from './filtro';

export const dynamic = 'force-dynamic';

/** Id do formulário de lote — as caixas da tabela o alcançam por `form=`. */
const LOTE = 'lote-turmas';

const btn =
  'rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover';

export default async function Turmas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const filtro = lerFiltro(typeof sp.f === 'string' ? sp.f : '');

  // `ok` volta da ação, só com números: situação aplicada, turmas mudadas,
  // ofertas que mudaram junto, ofertas mantidas (já têm resposta) e alunos com
  // tarefa em ciclo aberto que só estão nessas turmas.
  const [okSituacao, okTurmas, okOfertas, okCongeladas, okAlunos] = (
    typeof sp.ok === 'string' ? sp.ok : ''
  ).split('.');
  const resumo =
    okSituacao === 'ATIVO' || okSituacao === 'INATIVO'
      ? {
          situacao: okSituacao,
          turmas: Number(okTurmas) || 0,
          ofertas: Number(okOfertas) || 0,
          congeladas: Number(okCongeladas) || 0,
          alunos: Number(okAlunos) || 0,
        }
      : null;

  const where = montarWhere(q, filtro);

  const [total, turmas, contagens] = await Promise.all([
    prisma.schoolClass.count({ where }),
    prisma.schoolClass.findMany({
      where,
      orderBy: [{ course: { nome: 'asc' } }, { nome: 'asc' }],
      skip: pular,
      take: POR_PAGINA,
      include: {
        course: { select: { nome: true } },
        term: { select: { codigo: true } },
        _count: {
          select: {
            matriculas: { where: { ativo: true } },
            alocacoes: { where: { ativo: true } },
          },
        },
      },
    }),
    // Contagem de cada aba, sem a busca: o número diz quanto existe.
    Promise.all(FILTROS.map((f) => prisma.schoolClass.count({ where: montarWhere('', f.chave) }))),
  ]);

  // Ofertas no total (com as desligadas), para mostrar "2 de 5" numa turma
  // inativa — é o que explica por que não gera card.
  const ofertasNoTotal = new Map(
    (
      await prisma.teachingAssignment.groupBy({
        by: ['classId'],
        where: { classId: { in: turmas.map((t) => t.id) } },
        _count: { _all: true },
      })
    ).map((g) => [g.classId, g._count._all]),
  );

  // A página só volta junto na aba "Todas", onde a lista não encolhe com a ação.
  const volta = `/cadastros/turmas?${new URLSearchParams({
    ...(filtro ? { f: filtro } : {}),
    ...(q ? { q } : {}),
    ...(!filtro && pagina > 1 ? { p: String(pagina) } : {}),
  })}`;

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Turmas"
      descricao="Turmas dos semestres importados. Desativar uma turma (e as disciplinas dela) a tira das próximas gerações de tarefas — o que já foi gerado não muda."
      buscaPlaceholder="Buscar turma ou curso… (ex.: PRAD)"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/turmas"
      parametros={filtro ? { f: filtro } : {}}
      colunas={[
        { titulo: <SelecionarTodos formulario={LOTE} />, estreita: true },
        { titulo: 'Turma' },
        { titulo: 'Curso' },
        { titulo: 'Semestre', estreita: true },
        { titulo: 'Turno', estreita: true },
        { titulo: 'Alunos', numerica: true, estreita: true },
        { titulo: 'Ofertas', numerica: true, estreita: true },
        { titulo: '', estreita: true },
      ]}
      linhas={turmas.map((t) => {
        const ofertasTotal = ofertasNoTotal.get(t.id) ?? 0;
        return [
          <input
            key="sel"
            type="checkbox"
            name="ids"
            value={t.id}
            form={LOTE}
            aria-label={`Selecionar ${t.nome}`}
            className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--color-brand-teal)]"
          />,
          <span className={t.ativo ? 'font-medium' : 'font-medium text-slate-400 line-through'}>
            {t.nome}
            {!t.ativo && (
              <span className="ml-2 no-underline">
                <Etiqueta tom="alerta">inativa</Etiqueta>
              </span>
            )}
          </span>,
          t.course.nome,
          <span className="font-mono text-xs text-slate-400">{t.term.codigo}</span>,
          <Etiqueta tom={t.turno === 'EAD' ? 'ok' : 'neutro'}>{t.turno.toLowerCase()}</Etiqueta>,
          t._count.matriculas,
          <span title="Ofertas ativas — e o total, quando há ofertas desligadas">
            {t._count.alocacoes}
            {ofertasTotal !== t._count.alocacoes && (
              <span className="text-slate-400"> de {ofertasTotal}</span>
            )}
          </span>,
          <form key="acao">
            <input type="hidden" name="volta" value={volta} />
            <button
              formAction={alternarTurma.bind(null, t.id)}
              className={btn}
              title={
                t.ativo
                  ? 'Tira esta turma e as disciplinas dela das próximas gerações de tarefas. Não altera tarefa já gerada.'
                  : 'Devolve esta turma e as disciplinas que a desativação desligou.'
              }
            >
              {t.ativo ? 'Desativar' : 'Ativar'}
            </button>
          </form>,
        ];
      })}
    >
      {resumo && (
        <div className="mt-6 rounded-2xl border border-brand-teal/30 bg-brand-teal/5 px-5 py-3 text-sm text-brand-navy">
          <p>
            <strong className="font-semibold text-brand-teal-hover">
              {resumo.turmas.toLocaleString('pt-BR')}{' '}
              {resumo.situacao === 'INATIVO'
                ? resumo.turmas === 1
                  ? 'turma desativada'
                  : 'turmas desativadas'
                : resumo.turmas === 1
                  ? 'turma ativada'
                  : 'turmas ativadas'}
              .
            </strong>{' '}
            {resumo.ofertas.toLocaleString('pt-BR')}{' '}
            {resumo.ofertas === 1 ? 'disciplina (oferta)' : 'disciplinas (ofertas)'}{' '}
            {resumo.situacao === 'INATIVO' ? 'desligada' : 'religada'}
            {resumo.ofertas === 1 ? '' : 's'} junto.
            {resumo.turmas === 0 && ' Nenhuma turma mudou — já estavam nessa situação.'}
          </p>

          {(resumo.congeladas > 0 || resumo.alunos > 0) && resumo.situacao === 'INATIVO' && (
            <ul className="mt-2 space-y-0.5 text-xs text-brand-orange">
              {resumo.congeladas > 0 && (
                <li>
                  {resumo.congeladas.toLocaleString('pt-BR')}{' '}
                  {resumo.congeladas === 1
                    ? 'oferta já tem resposta e foi mantida'
                    : 'ofertas já têm resposta e foram mantidas'}{' '}
                  como está — mas a turma não gera mais cards.
                </li>
              )}
              {resumo.alunos > 0 && (
                <li>
                  {resumo.alunos.toLocaleString('pt-BR')}{' '}
                  {resumo.alunos === 1 ? 'aluno tem' : 'alunos têm'} tarefa em ciclo aberto só por
                  estar nessas turmas. Nada foi alterado: se quiser tirá-los do ciclo, use{' '}
                  <em>Retirar do ciclo</em> na lista de respondentes.
                </li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------- abas */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {FILTROS.map((aba, i) => {
          const ativa = filtro === aba.chave;
          const n = contagens[i];
          const alerta = aba.chave === 'inativas' && n > 0;
          return (
            <Link
              key={aba.chave || 'todas'}
              href={`/cadastros/turmas${aba.chave ? `?f=${aba.chave}` : ''}`}
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
          <p className="text-sm font-semibold text-brand-navy">Ativar ou desativar em lote</p>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Marque as linhas, ou busque (ex.: <strong>PRAD</strong>) e aplique a tudo que casa —
            inclusive o que está em outras páginas. Desativar leva junto as disciplinas (ofertas)
            da turma; as que já têm resposta ficam como estão. A decisão sobrevive à próxima
            importação do JACAD.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            formAction={definirTurmasEmLote.bind(null, 'INATIVO', 'marcadas')}
            className="rounded-lg bg-brand-orange px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Desativar marcadas
          </button>
          <button formAction={definirTurmasEmLote.bind(null, 'ATIVO', 'marcadas')} className={btn}>
            Ativar marcadas
          </button>
          {/* Só com um recorte ativo: em "Todas", sem busca, o rótulo seria
              "desativar as 123" — um clique a uma busca de distância de tirar
              todas as turmas do ciclo. */}
          {(filtro || q) && (
            <button
              formAction={definirTurmasEmLote.bind(null, 'INATIVO', 'filtro')}
              className="rounded-lg border border-brand-orange/50 px-3 py-1.5 text-[11px] font-semibold text-brand-orange transition-colors hover:bg-brand-orange/10"
              title="Ignora a seleção e aplica a tudo que casa com a aba e a busca atuais"
            >
              Desativar as {total.toLocaleString('pt-BR')} do filtro
            </button>
          )}
        </div>
      </form>
    </Lista>
  );
}
