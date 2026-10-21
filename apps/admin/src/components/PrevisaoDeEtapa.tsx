/**
 * Uma etapa do questionário, como o respondente a vê — mas só para olhar.
 *
 * ESPELHA `app/responder/[taskId]/page.tsx`, com os campos desabilitados e sem
 * ação de salvar. É uma cópia de propósito, e vale dizer por quê: aquela página
 * guarda `Escala` e `Opcoes` dentro dela, sem exportar (o Next não deixa uma
 * página exportar mais que a própria página), e refatorá-la para compartilhar
 * mexeria na tela que os alunos estão usando agora. A unificação fica para uma
 * hora em que não haja pesquisa aberta.
 *
 * O custo da cópia: se o visual de lá mudar, mude aqui também.
 *
 * Perguntas condicionais aparecem SEMPRE, com a nota de quando surgem. Na tela
 * do respondente elas só aparecem depois de uma resposta; quem confere o
 * formulário precisa vê-las sem ter que responder.
 */
import { descreverCondicao } from '@/lib/previa';

type Config = {
  min?: number;
  max?: number;
  labels?: Record<string, string>;
  permiteNaoSeAplica?: boolean;
  rotuloNaoSeAplica?: string;
  maxLength?: number;
};

export type PerguntaDaEtapa = {
  id: string;
  tipo: string;
  enunciado: string;
  ajuda: string | null;
  obrigatoria: boolean;
  config: unknown;
  condicao: unknown;
  opcoes: { id: string; rotulo: string }[];
};

export type BlocoDaEtapa = {
  titulo: string;
  obrigatorio: boolean;
  questoes: PerguntaDaEtapa[];
};

export function EtapaPrevia({
  bloco,
  rotulo,
  subtitulo,
}: {
  bloco: BlocoDaEtapa | null;
  rotulo: string;
  subtitulo: string | null;
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
      <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />

      <div className="border-b border-slate-100 px-6 pb-4 pt-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {bloco?.titulo ?? 'Bloco não encontrado'}
        </p>
        <h2 className="mt-1 font-brand text-xl font-bold tracking-tight text-brand-navy">
          {rotulo}
        </h2>
        {subtitulo && <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>}
      </div>

      {/* `inert`: nada aqui é clicável nem recebe foco — é só para olhar. */}
      <ol className="flex flex-col" {...{ inert: true }}>
        {bloco?.questoes.map((q, i) => {
          const cfg = (q.config ?? {}) as Config;
          const campo = `previa:${q.id}`;
          const condicao = descreverCondicao(q, bloco.questoes);
          const exigir = Boolean(bloco.obrigatorio && q.obrigatoria);

          return (
            <li key={q.id} className="border-b border-slate-50 px-6 py-5 last:border-0">
              <p className="text-sm font-medium text-brand-navy">
                <span className="mr-2 font-mono text-xs text-slate-300">{i + 1}</span>
                {q.enunciado}
                {!q.obrigatoria && (
                  <span className="ml-2 text-[10px] uppercase tracking-[0.06em] text-slate-300">
                    opcional
                  </span>
                )}
              </p>
              {q.ajuda && <p className="mt-1 text-xs text-slate-400">{q.ajuda}</p>}

              {condicao && (
                <p className="mt-2 inline-block rounded-lg border border-dashed border-brand-orange/40 bg-brand-orange/5 px-2 py-1 text-[11px] text-brand-orange">
                  {condicao}
                </p>
              )}

              <div className="mt-3">
                {q.tipo === 'LIKERT' || q.tipo === 'NPS' ? (
                  <Escala campo={campo} cfg={cfg} nps={q.tipo === 'NPS'} exigir={exigir} />
                ) : q.tipo === 'SIM_NAO' ? (
                  <div className="flex gap-2">
                    {[
                      ['sim', 'Sim'],
                      ['nao', 'Não'],
                    ].map(([v, r]) => (
                      <label key={v}>
                        <input type="radio" name={campo} value={v} className="peer sr-only" />
                        <span className="block rounded-xl border border-brand-navy/15 bg-white px-5 py-2 text-sm text-slate-600">
                          {r}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : q.tipo === 'ESCOLHA_UNICA' || q.tipo === 'ESCOLHA_MULTIPLA' ? (
                  <Opcoes campo={campo} opcoes={q.opcoes} multipla={q.tipo === 'ESCOLHA_MULTIPLA'} />
                ) : (
                  <textarea
                    name={campo}
                    disabled
                    rows={3}
                    maxLength={cfg.maxLength ?? 500}
                    placeholder="Escreva aqui (opcional)"
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Escala({
  campo,
  cfg,
  nps,
  exigir,
}: {
  campo: string;
  cfg: Config;
  nps: boolean;
  exigir?: boolean;
}) {
  const min = cfg.min ?? (nps ? 0 : 1);
  const max = cfg.max ?? (nps ? 10 : 5);
  const valores = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  void exigir;

  return (
    <div className="flex flex-wrap gap-2">
      {valores.map((v) => (
        <label key={v}>
          <input type="radio" name={campo} value={v} className="peer sr-only" />
          <span
            className={`flex flex-col items-center justify-center rounded-xl border border-brand-navy/15 bg-white text-slate-600 ${
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

      {cfg.permiteNaoSeAplica && (
        <label>
          <input type="radio" name={campo} value="__na__" className="peer sr-only" />
          <span className="flex min-w-20 max-w-xs items-center justify-center rounded-xl border border-dashed border-brand-navy/20 bg-white px-3 py-2 text-center text-xs leading-tight text-slate-400">
            {cfg.rotuloNaoSeAplica ?? 'Não se aplica'}
          </span>
        </label>
      )}
    </div>
  );
}

function Opcoes({
  campo,
  opcoes,
  multipla,
}: {
  campo: string;
  opcoes: { id: string; rotulo: string }[];
  multipla: boolean;
}) {
  if (opcoes.length === 0) {
    return (
      <p className="text-xs text-brand-orange">
        Esta pergunta está sem alternativas cadastradas. O respondente veria este aviso.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {opcoes.map((o) => (
        <label
          key={o.id}
          className="flex items-center gap-3 rounded-xl border border-brand-navy/15 bg-white px-4 py-2.5 text-sm text-slate-600"
        >
          <input
            type={multipla ? 'checkbox' : 'radio'}
            name={campo}
            className="h-4 w-4 shrink-0 accent-brand-teal"
          />
          {o.rotulo}
        </label>
      ))}
      {multipla && <p className="text-[11px] text-slate-400">Pode marcar mais de uma.</p>}
    </div>
  );
}
