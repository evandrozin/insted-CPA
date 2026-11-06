/**
 * Questionário de egressos — página pública, sem login.
 *
 * É o link que a CPA divulga a quem já concluiu o curso. Uma página só, todas as
 * perguntas de uma vez: sem conta não há rascunho para guardar entre etapas, e
 * recarregar a tela não pode custar o que a pessoa já preencheu mais do que o
 * necessário. O que se envia é gravado de uma vez, anônimo (ver `actions.ts`).
 *
 * Só aparece enquanto há um ciclo de egressos ABERTO.
 */
import Image from 'next/image';
import { prisma } from '@insted/database';
import { cicloDeEgressos } from '@/lib/egressos';
import { enviarEgresso } from './actions';
import { PerguntaCondicional } from '@/components/PerguntaCondicional';
import { lerCondicao } from '@/lib/condicao';

export const dynamic = 'force-dynamic';

type Config = {
  min?: number;
  max?: number;
  labels?: Record<string, string>;
  maxLength?: number;
};

const ABERTURA_PADRAO =
  'Você está sendo convidado(a) a responder a um questionário sobre sua formação e inserção no mercado de trabalho. Ele tem a finalidade de conhecer o perfil do egresso e de apoiar a revisão contínua dos processos de aprendizagem e formação, para a melhoria da qualidade dos serviços educacionais prestados. Garantimos o sigilo quanto ao seu nome ou qualquer informação que possa identificá-lo. Agradecemos antecipadamente a sua contribuição.\n\nComissão Própria de Avaliação (CPA)';

export default async function Egressos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const erro = typeof sp.erro === 'string' ? sp.erro.slice(0, 300) : null;

  const ciclo = await cicloDeEgressos().catch(() => null);
  const periodForm = ciclo?.formularios[0];

  if (!ciclo || !periodForm) {
    return (
      <Moldura>
        <div className="px-6 py-8 text-center">
          <h1 className="font-brand text-xl font-bold tracking-tight text-brand-navy">
            Programa de Acompanhamento de Egressos
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            A pesquisa de egressos não está aberta no momento. Volte quando a CPA divulgar o período
            de respostas.
          </p>
        </div>
      </Moldura>
    );
  }

  // Todos os cursos, inclusive os desativados: o egresso pode ter concluído um
  // curso que a Faculdade não oferece mais. Fora os que só existem na pós, que
  // têm outro instrumento.
  const cursos = await prisma.course
    .findMany({
      where: {
        NOT: {
          AND: [{ turmas: { some: { term: { semestre: 0 } } } }, { turmas: { none: { term: { semestre: { gt: 0 } } } } }],
        },
      },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    })
    .catch(() => []);
  const nomesVistos = new Set<string>();
  const cursosUnicos = cursos.filter((c) => {
    const k = c.nome.trim().toLowerCase();
    if (nomesVistos.has(k)) return false;
    nomesVistos.add(k);
    return true;
  });

  const blocos = periodForm.form.blocos;

  return (
    <Moldura>
      <form className="px-6 py-6" method="post">
        <h1 className="font-brand text-xl font-bold tracking-tight text-brand-navy">
          {ciclo.nome}
        </h1>
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {ciclo.mensagemBoasVindas ?? ABERTURA_PADRAO}
        </p>

        {erro && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600"
          >
            {erro}
          </p>
        )}

        {/* Isca contra robô: fora da tela e do teclado. Pessoa nenhuma preenche. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            Não preencha
            <input type="text" name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        {/* ------------------------------------------------ curso de origem */}
        <section className="mt-6 rounded-2xl border border-brand-navy/10 bg-brand-light px-5 py-4">
          <label className="block text-sm font-medium text-brand-navy">
            Curso concluído na Faculdade Insted
            <span className="ml-1 text-brand-orange">*</span>
            <select
              name="curso"
              required
              defaultValue=""
              className="mt-2 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-teal"
            >
              <option value="" disabled>
                Escolha o curso
              </option>
              {cursosUnicos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
              <option value="outro">Outro curso (informe na pergunta “Outro curso” abaixo)</option>
            </select>
          </label>
        </section>

        {blocos.map((bloco) => (
          <section
            key={bloco.id}
            className="relative mt-6 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white"
          >
            <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />
            <div className="border-b border-slate-100 px-5 pb-3 pt-5">
              <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
                {bloco.titulo}
              </h2>
              {bloco.descricao && <p className="mt-0.5 text-sm text-slate-500">{bloco.descricao}</p>}
            </div>

            <ol className="flex flex-col">
              {bloco.questoes.map((q, i) => {
                const cfg = (q.config ?? {}) as Config;
                const campo = `r:${q.id}:__global__`;
                const condicao = lerCondicao(q.condicao);
                const controle =
                  condicao && bloco.questoes.some((o) => o.id === condicao.questionId)
                    ? condicao
                    : null;

                const conteudo = (
                  <>
                    <p className="text-sm font-medium text-brand-navy">
                      <span className="mr-2 font-mono text-xs text-slate-300">{i + 1}</span>
                      {q.enunciado}
                      {q.obrigatoria ? (
                        <span className="ml-1 text-brand-orange">*</span>
                      ) : (
                        <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-slate-300">
                          opcional
                        </span>
                      )}
                    </p>
                    {q.ajuda && <p className="mt-1 text-xs text-slate-400">{q.ajuda}</p>}

                    <div className="mt-3">
                      {q.tipo === 'LIKERT' || q.tipo === 'NPS' ? (
                        <Escala campo={campo} cfg={cfg} nps={q.tipo === 'NPS'} exigir={q.obrigatoria} />
                      ) : q.tipo === 'SIM_NAO' ? (
                        <div className="flex gap-2">
                          {[
                            ['sim', 'Sim'],
                            ['nao', 'Não'],
                          ].map(([v, r]) => (
                            <label key={v} className="cursor-pointer">
                              <input
                                type="radio"
                                name={campo}
                                value={v}
                                required={q.obrigatoria}
                                className="peer sr-only"
                              />
                              <span className="block rounded-xl border border-brand-navy/15 bg-white px-5 py-2 text-sm text-slate-600 peer-checked:border-brand-teal peer-checked:bg-brand-teal/10 peer-checked:font-semibold peer-checked:text-brand-teal-hover peer-focus-visible:ring-2 peer-focus-visible:ring-brand-teal/40">
                                {r}
                              </span>
                            </label>
                          ))}
                        </div>
                      ) : q.tipo === 'ESCOLHA_UNICA' || q.tipo === 'ESCOLHA_MULTIPLA' ? (
                        <Opcoes
                          campo={campo}
                          opcoes={q.opcoes}
                          multipla={q.tipo === 'ESCOLHA_MULTIPLA'}
                          exigir={q.obrigatoria}
                        />
                      ) : (
                        <textarea
                          name={campo}
                          required={q.obrigatoria}
                          rows={cfg.maxLength && cfg.maxLength <= 20 ? 1 : 3}
                          maxLength={cfg.maxLength ?? 1000}
                          className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal"
                        />
                      )}
                    </div>
                  </>
                );

                const estilo = 'border-b border-slate-50 px-5 py-5 last:border-0';

                return controle ? (
                  <PerguntaCondicional
                    key={q.id}
                    campoControle={`r:${controle.questionId}:__global__`}
                    condicao={controle}
                    className={estilo}
                  >
                    {conteudo}
                  </PerguntaCondicional>
                ) : (
                  <li key={q.id} className={estilo}>
                    {conteudo}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}

        <div className="mt-6 rounded-xl bg-brand-light px-4 py-3 text-sm text-slate-600">
          <p className="font-semibold text-brand-navy">O envio é definitivo e anônimo.</p>
          <p className="mt-1">
            Não pedimos o seu nome e não há como ligar as respostas a você.
          </p>
        </div>

        <button
          formAction={enviarEgresso}
          className="mt-5 w-full rounded-xl bg-brand-teal px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover sm:w-auto"
        >
          Enviar respostas
        </button>
      </form>
    </Moldura>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-light px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <div className="flex justify-center">
          <Image
            src="/logo-insted.png"
            alt="Insted Centro Universitário"
            width={550}
            height={162}
            className="h-11 w-auto"
            priority
          />
        </div>
        <div className="relative mt-8 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
          <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />
          {children}
        </div>
      </div>
    </div>
  );
}

/** Escala numérica — botões grandes, bons de tocar no celular. */
function Escala({
  campo,
  cfg,
  nps,
  exigir,
}: {
  campo: string;
  cfg: Config;
  nps: boolean;
  exigir: boolean;
}) {
  const min = cfg.min ?? (nps ? 0 : 1);
  const max = cfg.max ?? (nps ? 10 : 5);
  const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <div className="flex flex-wrap gap-2">
      {valores.map((v) => (
        <label key={v} className="cursor-pointer">
          <input type="radio" name={campo} value={v} required={exigir} className="peer sr-only" />
          <span
            className={`flex flex-col items-center justify-center rounded-xl border border-brand-navy/15 bg-white text-slate-600 peer-checked:border-brand-teal peer-checked:bg-brand-teal/10 peer-checked:font-semibold peer-checked:text-brand-teal-hover peer-focus-visible:ring-2 peer-focus-visible:ring-brand-teal/40 ${
              nps ? 'h-11 w-11 text-sm' : 'min-w-20 px-3 py-2'
            }`}
          >
            <span className={nps ? '' : 'text-xs font-semibold'}>{v}</span>
            {!nps && cfg.labels?.[String(v)] && (
              <span className="mt-0.5 text-[10px] leading-tight">{cfg.labels[String(v)]}</span>
            )}
          </span>
        </label>
      ))}
    </div>
  );
}

/** Alternativas: o valor enviado é `o:<id>`, nunca o rótulo. */
function Opcoes({
  campo,
  opcoes,
  multipla,
  exigir,
}: {
  campo: string;
  opcoes: { id: string; rotulo: string }[];
  multipla: boolean;
  exigir: boolean;
}) {
  if (opcoes.length === 0) {
    return (
      <p className="text-xs text-brand-orange">
        Esta pergunta está sem alternativas cadastradas. Avise a CPA.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {opcoes.map((o) => (
        <label
          key={o.id}
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-brand-navy/15 bg-white px-4 py-2.5 text-sm text-slate-600 transition-colors has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal/10 has-[:checked]:font-semibold has-[:checked]:text-brand-teal-hover has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-teal/40"
        >
          <input
            type={multipla ? 'checkbox' : 'radio'}
            name={campo}
            value={`o:${o.id}`}
            required={exigir && !multipla}
            className="h-4 w-4 shrink-0 accent-brand-teal"
          />
          {o.rotulo}
        </label>
      ))}
      {multipla && <p className="text-[11px] text-slate-400">Pode marcar mais de uma.</p>}
    </div>
  );
}
