'use client';

/**
 * Fronteira de erro do painel.
 *
 * Sem ela, uma Server Action que lança erro falha em silêncio: o usuário clica,
 * nada acontece e não há explicação. As validações do sistema ("nenhum semestre
 * de 2027 foi importado", "ciclo aberto não pode mudar de formulário") são
 * justamente as mensagens que a pessoa precisa ler para saber o que fazer.
 */
import { useEffect } from 'react';

export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 lg:px-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-orange">
        Não foi possível concluir
      </p>
      <h1 className="mt-2 font-brand text-2xl font-bold tracking-tight text-brand-navy">
        A ação foi recusada
      </h1>

      <p className="mt-4 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-5 py-4 text-sm text-slate-700">
        {error.message || 'Erro inesperado.'}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          onClick={reset}
          className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
        >
          Tentar de novo
        </button>
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
