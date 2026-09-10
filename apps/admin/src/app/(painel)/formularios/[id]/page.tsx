/**
 * Formulário completo — leitura e edição.
 *
 * Reordenar e reescrever acontecem aqui, não no código. A edição fica atrás de
 * um `<details>` para que a tela continue servindo à leitura corrida dos 95
 * itens do formulário docente; abrir um item revela os campos.
 *
 * Sem JavaScript de cliente: cada botão é um submit de Server Action. Funciona
 * com o teclado, sobrevive a um reload e não depende de hidratação.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import {
  salvarQuestao,
  moverQuestao,
  excluirQuestao,
  adicionarQuestao,
  alternarObrigatoria,
  alternarPeso,
  salvarBloco,
  moverBloco,
  alternarRepetivelDocente,
  adicionarBloco,
  excluirBloco,
  publicarFormulario,
} from './actions';
import { TIPOS_ALVO, ROTULO_ALVO } from './alvos';

export const dynamic = 'force-dynamic';

const dataCurta = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(d);

const PUBLICO: Record<string, string> = {
  ALUNO: 'Discentes',
  PROFESSOR: 'Docentes',
  TECNICO_ADMIN: 'Técnico-administrativo',
};

const TIPO: Record<string, string> = {
  LIKERT: 'escala',
  NPS: 'NPS 0–10',
  TEXTO_LIVRE: 'texto livre',
  SIM_NAO: 'sim/não',
  ESCOLHA_UNICA: 'escolha única',
  ESCOLHA_MULTIPLA: 'múltipla escolha',
};

type Config = {
  labels?: Record<string, string>;
  permiteNaoSeAplica?: boolean;
  legendaPendenteConfirmacao?: boolean;
};

function resumoEscala(cfg: Config | null): string | null {
  if (!cfg?.labels) return null;
  const ks = Object.keys(cfg.labels).sort((a, b) => Number(a) - Number(b));
  if (ks.length === 0) return null;
  const na = cfg.permiteNaoSeAplica ? ' + não se aplica' : '';
  return `${ks[0]} ${cfg.labels[ks[0]]} … ${ks[ks.length - 1]} ${cfg.labels[ks[ks.length - 1]]}${na}`;
}

// -------------------------------------------------------------- estilos base
const btn =
  'rounded-lg border border-brand-navy/10 bg-white px-2 py-1 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover disabled:opacity-30';
const btnPrimario =
  'rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover';
const campo =
  'w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal';

export default async function Formulario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const form = await prisma.formTemplate
    .findUnique({
      where: { id },
      include: {
        blocos: {
          orderBy: { ordem: 'asc' },
          include: { questoes: { orderBy: { ordem: 'asc' } } },
        },
      },
    })
    .catch(() => null);

  if (!form) notFound();

  const editavel = form.status === 'RASCUNHO';
  const totalQuestoes = form.blocos.reduce((s, b) => s + b.questoes.length, 0);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <Link
        href="/formularios"
        className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
      >
        ← Formulários
      </Link>

      <header className="mt-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          {PUBLICO[form.publico] ?? form.publico} · v{form.versao} · {form.status.toLowerCase()}
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          {form.nome}
        </h1>
        <p className="mt-2 text-slate-500">
          {form.blocos.length} blocos · {totalQuestoes} questões
        </p>
        <p className="mt-3 text-sm text-slate-500">
          {editavel ? (
            <>
              Clique em uma questão para editar o texto. As setas reordenam. Publicar congela a
              versão — depois disso só uma nova versão pode ser alterada.
            </>
          ) : (
            <span className="text-brand-orange">
              Formulário publicado{form.publicadoEm ? ` em ${dataCurta(form.publicadoEm)}` : ''}:
              imutável. Duplique para criar a próxima versão.
            </span>
          )}
        </p>

        {editavel && (
          <form className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-brand-navy">Publicar este formulário</p>
              <p className="mt-0.5 max-w-xl text-xs text-slate-500">
                Congela o instrumento e guarda uma cópia integral do que foi perguntado. É o que
                permite comparar a média de um ano com a do outro sabendo que a pergunta era a
                mesma. Não tem desfazer — para mudar depois, duplique numa nova versão.
              </p>
            </div>
            <button
              formAction={publicarFormulario.bind(null, form.id)}
              className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
            >
              Publicar
            </button>
          </form>
        )}
      </header>

      <div className="mt-8 flex flex-col gap-6">
        {form.blocos.map((bloco, i) => {
          const cfg = (bloco.questoes[0]?.config ?? null) as Config | null;
          const escala = resumoEscala(cfg);
          const alerta = /DUPLICADO|RISCO|ATENÇÃO|inconsistente/i.test(bloco.descricao ?? '');
          const primeiro = i === 0;
          const ultimo = i === form.blocos.length - 1;
          // Só faz sentido oferecer "um card por professor" onde o bloco fala de docentes.
          const podeVirarPorProfessor =
            editavel &&
            (bloco.repetivel ||
              /docente|professor/i.test(bloco.titulo) ||
              bloco.targetType === 'PROFESSOR_DISCIPLINA');

          return (
            <section
              key={bloco.id}
              className="overflow-hidden rounded-2xl border border-brand-navy/10 bg-white"
            >
              {/* ---------------------------------------------- cabeçalho */}
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-xs text-slate-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h2 className="font-brand text-base font-semibold text-brand-navy">
                    {bloco.titulo}
                  </h2>
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-500">
                    {bloco.targetType.toLowerCase().replace(/_/g, ' ')}
                  </span>
                  {bloco.repetivel && (
                    <span className="rounded bg-brand-teal/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-teal-hover">
                      um card por professor
                    </span>
                  )}

                  {/* div, não span: <form> dentro de <span> é aninhamento
                      inválido e quebra a hidratação — sem hidratação, os
                      Server Actions não são interceptados e nada funciona. */}
                  <div className="ml-auto flex items-center gap-1.5">
                    <span className="mr-1 text-xs text-slate-400 tabular-nums">
                      {bloco.questoes.length}
                    </span>
                    {editavel && (
                      <>
                        <form>
                          <input type="hidden" name="blockId" value={bloco.id} />
                          <button
                            formAction={moverBloco.bind(null, 'cima')}
                            className={btn}
                            disabled={primeiro}
                            title="Mover bloco para cima"
                          >
                            ↑
                          </button>
                        </form>
                        <form>
                          <input type="hidden" name="blockId" value={bloco.id} />
                          <button
                            formAction={moverBloco.bind(null, 'baixo')}
                            className={btn}
                            disabled={ultimo}
                            title="Mover bloco para baixo"
                          >
                            ↓
                          </button>
                        </form>
                      </>
                    )}
                  </div>
                </div>

                {escala && (
                  <p className="mt-2 text-xs text-slate-500">
                    <span className="font-semibold">Escala:</span> {escala}
                  </p>
                )}
                {cfg?.legendaPendenteConfirmacao && (
                  <p className="mt-1 text-xs text-brand-orange">
                    Escala 1–5 sem legenda no formulário original — confirmar antes de publicar.
                  </p>
                )}

                {bloco.descricao && (
                  <p
                    className={`mt-3 rounded-lg px-3 py-2 text-xs leading-relaxed ${
                      alerta
                        ? 'border border-brand-orange/30 bg-brand-orange/5 text-slate-600'
                        : 'bg-brand-light text-slate-500'
                    }`}
                  >
                    {bloco.descricao}
                  </p>
                )}

                {editavel && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-brand-teal hover:text-brand-teal-hover">
                      Editar bloco
                    </summary>
                    <form className="mt-3 flex flex-col gap-2">
                      <input type="hidden" name="blockId" value={bloco.id} />
                      <input name="titulo" defaultValue={bloco.titulo} className={campo} />
                      <textarea
                        name="descricao"
                        defaultValue={bloco.descricao ?? ''}
                        rows={3}
                        placeholder="Descrição ou nota interna do bloco (opcional)"
                        className={campo}
                      />

                      <div className="flex flex-wrap items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-500">
                          Sobre o quê:
                          <select
                            name="targetType"
                            defaultValue={bloco.targetType}
                            className={`${campo} w-auto py-1.5`}
                          >
                            {TIPOS_ALVO.map((t) => (
                              <option key={t} value={t}>
                                {ROTULO_ALVO[t]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label
                          className="flex items-center gap-2 text-xs text-slate-500"
                          title="Gera um card por alvo do respondente. Só vale para setores, disciplinas e professores — a instituição é uma só."
                        >
                          <input
                            type="checkbox"
                            name="repetivel"
                            defaultChecked={bloco.repetivel}
                            className="accent-brand-teal"
                          />
                          Um card por alvo
                        </label>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button formAction={salvarBloco} className={btnPrimario}>
                          Salvar bloco
                        </button>
                        {podeVirarPorProfessor && (
                          <button
                            formAction={alternarRepetivelDocente}
                            className={btn}
                            title="Atalho: alterna entre nota geral do corpo docente e nota por professor alocado"
                          >
                            {bloco.repetivel
                              ? 'Voltar para nota geral do corpo docente'
                              : 'Repetir por professor (nota individual)'}
                          </button>
                        )}
                        <button
                          formAction={excluirBloco}
                          className={`${btn} ml-auto hover:border-brand-orange/50 hover:text-brand-orange`}
                          title={`Exclui o bloco e suas ${bloco.questoes.length} questões`}
                        >
                          Excluir bloco
                        </button>
                      </div>
                    </form>
                  </details>
                )}
              </div>

              {/* ------------------------------------------------ questões */}
              <ol className="flex flex-col">
                {bloco.questoes.map((q, j) => {
                  const pesoZero = Number(q.peso) === 0;
                  return (
                    <li key={q.id} className="flex border-b border-slate-50 last:border-0">
                      {/* Setas fora do <details>: reordenar é a ação mais
                          frequente e não deve exigir abrir cada questão. */}
                      {editavel && (
                        <div className="flex shrink-0 flex-col gap-1 py-3 pl-4">
                          <form>
                            <input type="hidden" name="questionId" value={q.id} />
                            <button
                              formAction={moverQuestao.bind(null, 'cima')}
                              className={btn}
                              disabled={j === 0}
                              title="Subir"
                            >
                              ↑
                            </button>
                          </form>
                          <form>
                            <input type="hidden" name="questionId" value={q.id} />
                            <button
                              formAction={moverQuestao.bind(null, 'baixo')}
                              className={btn}
                              disabled={j === bloco.questoes.length - 1}
                              title="Descer"
                            >
                              ↓
                            </button>
                          </form>
                        </div>
                      )}

                      <details className="group min-w-0 flex-1">
                        <summary className="flex cursor-pointer list-none gap-3 px-5 py-3 text-sm hover:bg-brand-light/60">
                          <span className="mt-0.5 w-7 shrink-0 font-mono text-xs text-slate-300 tabular-nums">
                            {i + 1}.{j + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-brand-navy">{q.enunciado}</p>
                            {q.ajuda && <p className="mt-1 text-xs text-slate-400">{q.ajuda}</p>}
                          </div>
                          <span className="flex shrink-0 items-start gap-2">
                            {!q.obrigatoria && (
                              <span className="text-[10px] uppercase tracking-[0.06em] text-slate-300">
                                opcional
                              </span>
                            )}
                            {pesoZero && (
                              <span
                                className="text-[10px] uppercase tracking-[0.06em] text-slate-300"
                                title="Fora do cálculo da média do bloco"
                              >
                                peso 0
                              </span>
                            )}
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                              {TIPO[q.tipo] ?? q.tipo.toLowerCase()}
                            </span>
                          </span>
                        </summary>

                        {editavel && (
                          <div className="border-t border-slate-100 bg-brand-light/40 px-5 py-4">
                            <form className="flex flex-col gap-2">
                              <input type="hidden" name="questionId" value={q.id} />
                              <textarea
                                name="enunciado"
                                defaultValue={q.enunciado}
                                rows={2}
                                className={campo}
                                aria-label="Enunciado"
                              />
                              <input
                                name="ajuda"
                                defaultValue={q.ajuda ?? ''}
                                placeholder="Texto de apoio (opcional)"
                                className={campo}
                                aria-label="Texto de apoio"
                              />

                              <div className="flex flex-wrap items-center gap-1.5">
                                <button formAction={salvarQuestao} className={btnPrimario}>
                                  Salvar
                                </button>
                                <button formAction={alternarObrigatoria} className={btn}>
                                  {q.obrigatoria ? 'Tornar opcional' : 'Tornar obrigatória'}
                                </button>
                                <button
                                  formAction={alternarPeso}
                                  className={btn}
                                  title="Peso 0 mantém a pergunta no formulário mas fora da média"
                                >
                                  {pesoZero ? 'Contar na média' : 'Não contar na média'}
                                </button>
                                <button
                                  formAction={excluirQuestao}
                                  className={`${btn} ml-auto hover:border-brand-orange/50 hover:text-brand-orange`}
                                >
                                  Excluir
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ol>

              {editavel && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <form>
                    <input type="hidden" name="blockId" value={bloco.id} />
                    <button formAction={adicionarQuestao} className={btn}>
                      + Adicionar questão
                    </button>
                  </form>
                </div>
              )}
            </section>
          );
        })}

        {editavel && (
          <form className="rounded-2xl border border-dashed border-brand-navy/25 bg-white/60 px-5 py-5 text-center">
            <input type="hidden" name="formId" value={form.id} />
            <button formAction={adicionarBloco} className={btnPrimario}>
              + Adicionar bloco
            </button>
            <p className="mt-2 text-xs text-slate-400">
              Entra no fim do formulário. Depois defina sobre o que ele fala e mova para a posição.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
