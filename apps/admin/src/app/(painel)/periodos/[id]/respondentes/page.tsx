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
 *
 * Também é onde se TIRA gente do ciclo — quem entrou a mais. A tarefa fica,
 * marcada como retirada, e some das contagens de adesão: é o que impede a
 * pessoa de voltar sozinha na próxima geração e deixa o desfazer existir.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { SelecionarTodos } from '@/components/SelecionarTodos';
import {
  liberarReenvio,
  incluirRespondentes,
  retirarDoCiclo,
  recolocarNoCiclo,
} from '../../actions';

/** Id do formulário de retirada — as caixas da tabela o alcançam por `form=`. */
const RETIRADA = 'retirada-ciclo';

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

  // Resultado de uma inclusão recente, lido da auditoria pelo id — nomes de
  // aluno não viajam na URL.
  const idInclusao = typeof sp.inclusao === 'string' ? sp.inclusao : null;
  const inclusao = idInclusao
    ? await prisma.auditLog
        .findFirst({
          where: { id: idInclusao, acao: 'PERIOD_INCLUDE_RESPONDENTS', entidadeId: id },
          select: { dadosDepois: true },
        })
        .then(
          (l) =>
            (l?.dadosDepois ?? null) as {
              incluidos: { matricula: string; nome: string; cards: number }[];
              recusados: { matricula: string; nome: string | null; motivo: string }[];
              totalIncluidos: number;
              totalRecusados: number;
            } | null,
        )
        .catch(() => null)
    : null;

  // Resultado de uma retirada ou de um "recolocar", lido da auditoria pelo id.
  // Só números e matrículas viajam na URL do retorno; o id basta para achar o resto.
  const idRetirada = typeof sp.retirada === 'string' ? sp.retirada : null;
  const retirada = idRetirada
    ? await prisma.auditLog
        .findFirst({
          where: { id: idRetirada, acao: 'PERIOD_WITHDRAW_RESPONDENTS', entidadeId: id },
          select: { dadosDepois: true },
        })
        .then(
          (l) =>
            (l?.dadosDepois ?? null) as {
              motivo: string | null;
              totalRetirados: number;
              respostasApagadas: number;
              enviadasMantidas: number;
              semLote: number;
              jaRetiradas: number;
              naoEncontradas: number;
            } | null,
        )
        .catch(() => null)
    : null;

  const idRecolocado = typeof sp.recolocado === 'string' ? sp.recolocado : null;
  const recolocado = idRecolocado
    ? await prisma.auditLog
        .findFirst({
          where: { id: idRecolocado, acao: 'PERIOD_REINSTATE_RESPONDENT', entidadeId: id },
          select: { dadosDepois: true },
        })
        .then(
          (l) =>
            (l?.dadosDepois ?? null) as {
              matricula: string;
              voltou: boolean;
              recusados: { motivo: string }[];
            } | null,
        )
        .catch(() => null)
    : null;

  const ciclo = await prisma.evaluationPeriod
    .findUnique({ where: { id }, select: { id: true, nome: true, ano: true, status: true } })
    .catch(() => null);
  if (!ciclo) notFound();

  const where = {
    periodId: id,
    // "Todos" não inclui os retirados: quem saiu do ciclo tem aba própria, e
    // somá-los aqui faria o total não bater com o denominador da adesão.
    ...(filtro === 'TODOS'
      ? { status: { not: 'DISPENSADA' as const } }
      : { status: filtro as 'CONCLUIDA' | 'PENDENTE' | 'DISPENSADA' }),
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
        respondent: { select: { nome: true, matricula: true, email: true } },
        _count: { select: { alvos: true } },
      },
    }),
    prisma.evaluationTask.count({ where: { periodId: id, status: 'CONCLUIDA' } }),
  ]);

  const pendentes = await prisma.evaluationTask.count({
    where: { periodId: id, status: 'PENDENTE' },
  });
  const retirados = await prisma.evaluationTask.count({
    where: { periodId: id, status: 'DISPENSADA' },
  });
  const podeRetirar = ['RASCUNHO', 'AGENDADO', 'ABERTO'].includes(ciclo.status);

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
      descricao={`${concluidas.toLocaleString('pt-BR')} responderam e ${pendentes.toLocaleString('pt-BR')} faltam. A lista mostra QUEM respondeu, nunca o que — são tabelas separadas, e é essa separação que sustenta o anonimato.`}
      buscaPlaceholder="Buscar por nome ou matrícula…"
      q={q}
      pagina={pagina}
      total={total}
      href={`/periodos/${id}/respondentes`}
      parametros={filtro === 'CONCLUIDA' ? {} : { status: filtro }}
      colunas={[
        { titulo: <SelecionarTodos formulario={RETIRADA} />, estreita: true },
        { titulo: 'Matrícula', estreita: true },
        { titulo: 'Respondente' },
        { titulo: 'E-mail para aviso' },
        { titulo: 'Cards', numerica: true, estreita: true },
        { titulo: 'Situação', estreita: true },
        { titulo: 'Enviado em', estreita: true },
        { titulo: '', estreita: true },
      ]}
      linhas={tarefas.map((t) => [
        t.status === 'DISPENSADA' ? (
          <span key="sel" />
        ) : (
          <input
            key="sel"
            type="checkbox"
            name="ids"
            value={t.id}
            form={RETIRADA}
            aria-label="Selecionar para retirar do ciclo"
            className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--color-brand-teal)]"
          />
        ),
        <span className="font-mono text-xs text-slate-400">{t.respondent.matricula}</span>,
        <span className="font-medium">{t.respondent.nome}</span>,
        t.respondent.email.endsWith('@sem-email.insted.local') ? (
          <Etiqueta tom="alerta">sem e-mail</Etiqueta>
        ) : (
          <span className="text-xs text-slate-500">{t.respondent.email}</span>
        ),
        t._count.alvos,
        t.status === 'CONCLUIDA' ? (
          <Etiqueta tom="ok">enviado</Etiqueta>
        ) : t.status === 'DISPENSADA' ? (
          <Etiqueta tom="apagado">retirado</Etiqueta>
        ) : (
          <Etiqueta tom="neutro">pendente</Etiqueta>
        ),
        <span className="text-xs text-slate-400">{dataHora(t.concluidaEm)}</span>,
        t.status === 'DISPENSADA' ? (
          podeRetirar ? (
            <form>
              <button
                formAction={recolocarNoCiclo.bind(null, id, t.id)}
                className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
                title="Devolve a pessoa ao ciclo, com os cards gerados de novo"
              >
                Recolocar
              </button>
            </form>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )
        ) : t.status !== 'CONCLUIDA' ? (
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
      {retirada && (
        <div className="mb-3 rounded-2xl border border-brand-teal/30 bg-brand-teal/5 px-5 py-3 text-sm text-brand-navy">
          <p>
            <strong className="font-semibold text-brand-teal-hover">
              {retirada.totalRetirados.toLocaleString('pt-BR')}{' '}
              {retirada.totalRetirados === 1 ? 'pessoa retirada' : 'pessoas retiradas'} do ciclo.
            </strong>
            {retirada.respostasApagadas > 0 && (
              <> {retirada.respostasApagadas.toLocaleString('pt-BR')} conjunto(s) de resposta apagado(s).</>
            )}
            {retirada.motivo && <> Motivo: {retirada.motivo}.</>}
          </p>
          {(retirada.enviadasMantidas > 0 ||
            retirada.semLote > 0 ||
            retirada.jaRetiradas > 0 ||
            retirada.naoEncontradas > 0) && (
            <ul className="mt-2 space-y-0.5 text-xs text-brand-orange">
              {retirada.enviadasMantidas > 0 && (
                <li>
                  {retirada.enviadasMantidas} já enviaram e não foram tocadas — para retirá-las é
                  preciso marcar &ldquo;apagar também as respostas&rdquo;.
                </li>
              )}
              {retirada.semLote > 0 && (
                <li>
                  {retirada.semLote} enviaram antes da janela de retratação existir: não há como
                  localizar o que gravaram, e por isso ficaram.
                </li>
              )}
              {retirada.jaRetiradas > 0 && <li>{retirada.jaRetiradas} já estavam retiradas.</li>}
              {retirada.naoEncontradas > 0 && (
                <li>{retirada.naoEncontradas} matrícula(s) não têm tarefa neste ciclo.</li>
              )}
            </ul>
          )}
        </div>
      )}

      {recolocado && (
        <p
          className={`mb-3 rounded-2xl border px-5 py-3 text-sm ${
            recolocado.voltou
              ? 'border-brand-teal/30 bg-brand-teal/5 text-brand-navy'
              : 'border-brand-orange/40 bg-brand-orange/5 text-brand-navy'
          }`}
        >
          {recolocado.voltou ? (
            <>
              <span className="font-mono text-xs text-slate-400">{recolocado.matricula}</span> voltou
              ao ciclo, com os cards gerados de novo.
            </>
          ) : (
            <>
              <span className="font-mono text-xs">{recolocado.matricula}</span> não pôde voltar:{' '}
              {recolocado.recusados[0]?.motivo ?? 'não é elegível hoje'}. Continua retirado.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {aba('CONCLUIDA', 'Responderam')}
        {aba('PENDENTE', 'Faltam responder')}
        {aba('TODOS', 'Todos')}
        {retirados > 0 && aba('DISPENSADA', `Retirados · ${retirados.toLocaleString('pt-BR')}`)}

        <a
          href={`/periodos/${id}/respondentes/csv?${new URLSearchParams({
            status: filtro,
            ...(q ? { q } : {}),
          })}`}
          className="ml-auto rounded-lg border border-brand-navy/10 bg-white px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
        >
          Baixar planilha desta lista
        </a>
      </div>

      {/* --------------------------------- incluir quem ficou de fora */}
      {(ciclo.status === 'RASCUNHO' || ciclo.status === 'AGENDADO' || aberto) && (
        <details
          className="mt-4 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4"
          open={Boolean(inclusao)}
        >
          <summary className="cursor-pointer text-sm font-semibold text-brand-teal hover:text-brand-teal-hover">
            Incluir quem ficou de fora
          </summary>
          <p className="mt-2 max-w-2xl text-xs text-slate-500">
            Para a matrícula regularizada depois da geração, ou o aluno que chegou atrasado do
            JACAD. Só cria tarefa para quem ainda não tem — quem já começou a responder não é tocado,
            porque recalcular os cards descartaria o rascunho dele. Quem não puder entrar aparece com
            o motivo.
          </p>

          <form className="mt-3 flex flex-col gap-2">
            <textarea
              name="matriculas"
              rows={3}
              placeholder="Matrículas, uma por linha ou separadas por vírgula"
              className="w-full max-w-xl rounded-lg border border-brand-navy/15 px-3 py-2 font-mono text-xs text-brand-navy outline-none focus:border-brand-teal"
            />
            <div className="flex flex-wrap gap-2">
              <button
                formAction={incluirRespondentes.bind(null, id, 'lista')}
                className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
              >
                Incluir estas matrículas
              </button>
              <button
                formAction={incluirRespondentes.bind(null, id, 'todos')}
                className="rounded-lg border border-brand-navy/15 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
                title="Ignora a caixa de texto e procura todos os elegíveis sem tarefa"
              >
                Incluir todos os elegíveis que ainda não têm tarefa
              </button>
            </div>
          </form>

          {inclusao && (
            <div className="mt-4 rounded-xl border border-brand-navy/10 bg-brand-light px-4 py-3 text-xs">
              <p className="font-semibold text-brand-navy">
                {inclusao.totalIncluidos} incluído(s) · {inclusao.totalRecusados} não incluído(s)
              </p>
              {inclusao.incluidos.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-slate-600">
                  {inclusao.incluidos.slice(0, 30).map((p) => (
                    <li key={p.matricula}>
                      <span className="font-mono text-slate-400">{p.matricula}</span> {p.nome} —{' '}
                      {p.cards} cards
                    </li>
                  ))}
                </ul>
              )}
              {inclusao.recusados.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-brand-orange">
                  {inclusao.recusados.slice(0, 30).map((p) => (
                    <li key={p.matricula}>
                      <span className="font-mono">{p.matricula}</span>
                      {p.nome ? ` ${p.nome}` : ''} — {p.motivo}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </details>
      )}

      {/* --------------------------------------------- retirar do ciclo */}
      {podeRetirar && (
        <details
          className="mt-4 rounded-2xl border border-brand-orange/30 bg-white px-5 py-4"
          open={Boolean(retirada)}
        >
          <summary className="cursor-pointer text-sm font-semibold text-brand-orange">
            Retirar do ciclo — quem entrou a mais
          </summary>
          <p className="mt-2 max-w-2xl text-xs text-slate-500">
            Marque as linhas na tabela, ou cole as matrículas. A pessoa sai das contagens de
            adesão, deixa de ver a avaliação e não volta sozinha na próxima geração de tarefas —
            fica na aba <em>Retirados</em>, com o botão de recolocar.
          </p>

          <form id={RETIRADA} className="mt-3 flex flex-col gap-2">
            <textarea
              name="matriculas"
              rows={3}
              placeholder="Matrículas, uma por linha ou separadas por vírgula (opcional se marcou na tabela)"
              className="w-full max-w-xl rounded-lg border border-brand-navy/15 px-3 py-2 font-mono text-xs text-brand-navy outline-none focus:border-brand-teal"
            />
            <input
              name="motivo"
              maxLength={200}
              placeholder="Motivo (opcional) — fica na auditoria"
              className="w-full max-w-xl rounded-lg border border-brand-navy/15 px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-teal"
            />

            {aberto && (
              <label className="flex max-w-xl items-start gap-2 text-xs text-slate-600">
                <input type="checkbox" name="apagarRespostas" className="mt-0.5 h-3.5 w-3.5 accent-[color:var(--color-brand-orange)]" />
                <span>
                  <strong className="font-semibold text-brand-orange">
                    Apagar também as respostas de quem já enviou.
                  </strong>{' '}
                  Irreversível: a resposta é anônima e não há como pedir de novo. Sem marcar, quem
                  já enviou não é tocado — a resposta continuaria contando no resultado.
                </span>
              </label>
            )}

            <div>
              <button
                formAction={retirarDoCiclo.bind(null, id)}
                className="rounded-lg border border-brand-orange/40 bg-brand-orange/5 px-3 py-1.5 text-xs font-semibold text-brand-orange transition-colors hover:bg-brand-orange/15"
              >
                Retirar marcadas e listadas
              </button>
            </div>
          </form>
        </details>
      )}

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
