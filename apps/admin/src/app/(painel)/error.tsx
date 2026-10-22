'use client';

/**
 * Fronteira de erro do PAINEL da CPA.
 *
 * Substitui `app/error.tsx` só dentro do painel — a tela do aluno e o login
 * continuam com a deles, intocadas.
 *
 * Em produção o Next troca a mensagem de qualquer erro de Server Action por um
 * texto genérico + um código (`ref`). As recusas do painel ("ciclo encerrado",
 * "marque estou ciente"…) existem para explicar o que fazer, então esta tela
 * busca a mensagem real em `/api/erro`, onde `instrumentation.ts` a guardou.
 * Se não achar, mostra o código — que localiza o erro nos logs.
 */
import { useEffect, useState } from 'react';

const GENERICA = /An error occurred in the Server Components render/i;
const DESATUALIZADA = /Server Action .* was not found on the server/i;

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const generica = GENERICA.test(error.message);
  const desatualizada = DESATUALIZADA.test(error.message);

  // `buscando` só vale para o texto genérico; o resto já traz a mensagem.
  const [real, setReal] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(generica && Boolean(error.digest));

  useEffect(() => {
    console.error(error);
    // Avisa o aviso de processamento que a ação acabou — mal. Sem isto ele
    // ficaria por cima desta tela, escondendo justamente a mensagem que a
    // pessoa precisa ler.
    window.dispatchEvent(new Event('cpa:acao-terminou'));

    if (!generica || !error.digest) return;

    let cancelado = false;
    (async () => {
      // O registro é gravado em paralelo ao erro: pode chegar uns instantes
      // depois, então tenta algumas vezes antes de desistir.
      for (const espera of [0, 400, 1200, 2500]) {
        await esperar(espera);
        if (cancelado) return;
        try {
          const r = await fetch(`/api/erro?ref=${encodeURIComponent(error.digest!)}`, {
            cache: 'no-store',
          });
          if (r.status === 401) break;
          if (r.ok) {
            const j = (await r.json()) as { mensagem: string | null };
            if (j.mensagem) {
              if (!cancelado) setReal(j.mensagem);
              break;
            }
          }
        } catch {
          /* rede: tenta de novo */
        }
      }
      if (!cancelado) setBuscando(false);
    })();

    return () => {
      cancelado = true;
    };
  }, [error, generica]);

  const texto = desatualizada
    ? 'Esta página ficou desatualizada: o sistema foi atualizado depois que ela foi aberta. Recarregue a página (Ctrl+F5) e tente de novo.'
    : (real ??
      (generica
        ? buscando
          ? 'Buscando o motivo…'
          : 'O sistema recusou a ação, mas não conseguiu mostrar o motivo agora. Use o código abaixo para localizá-lo.'
        : error.message || 'Erro inesperado.'));

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 lg:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-orange">
        Não foi possível concluir
      </p>
      <h1 className="mt-2 font-brand text-2xl font-bold tracking-tight text-brand-navy">
        {desatualizada ? 'Página desatualizada' : 'A ação foi recusada'}
      </h1>

      <p className="mt-4 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-5 py-4 text-sm text-slate-700">
        {texto}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {desatualizada ? (
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Recarregar a página
          </button>
        ) : (
          <button
            onClick={reset}
            className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Tentar de novo
          </button>
        )}
        <a
          href="/periodos"
          className="rounded-lg border border-brand-navy/10 bg-white px-4 py-2 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
        >
          Voltar aos ciclos
        </a>
      </div>

      {error.digest && (
        <p className="mt-6 font-mono text-[10px] text-slate-300">ref {error.digest}</p>
      )}
    </div>
  );
}
