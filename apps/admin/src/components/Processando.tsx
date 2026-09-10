'use client';

/**
 * Aviso de "processando" para qualquer ação do sistema.
 *
 * Sem isso, clicar num botão que leva dez segundos não dá sinal nenhum — e a
 * reação natural é clicar de novo. Em ações que gravam, o segundo clique é o
 * problema.
 *
 * Escuta o envio de formulário no documento inteiro, em vez de exigir que
 * cada um dos quase quarenta formulários do painel se anuncie. Server Action
 * com HTML puro é submit de formulário; cobrir o evento cobre todas.
 *
 * Some quando o servidor responde. O sinal é a prop `marca`, gerada a cada
 * render do layout: toda ação revalida alguma rota, o layout renderiza de
 * novo com marca diferente, e o efeito derruba o aviso. Depender só da
 * mudança de URL não serviria — boa parte das ações revalida sem navegar.
 */
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

/** Espera antes de aparecer: ação instantânea não deve piscar a tela. */
const ATRASO_MS = 250;

/** A partir daqui, avisa que é demorado mesmo — importação leva minutos. */
const DEMORADO_MS = 15_000;

export function Processando({ marca }: { marca: number }) {
  const [visivel, setVisivel] = useState(false);
  const [demorado, setDemorado] = useState(false);
  const timers = useRef<number[]>([]);
  const caminho = usePathname();

  const limpar = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const esconder = () => {
    limpar();
    setVisivel(false);
    setDemorado(false);
  };

  // Resposta do servidor: o layout renderizou de novo.
  useEffect(esconder, [marca, caminho]);

  useEffect(() => {
    const mostrar = () => {
      limpar();
      timers.current.push(
        window.setTimeout(() => setVisivel(true), ATRASO_MS),
        window.setTimeout(() => setDemorado(true), DEMORADO_MS),
      );
    };

    const aoEnviar = (e: Event) => {
      const form = e.target as HTMLFormElement;
      // `data-sem-espera` desliga o aviso num formulário específico.
      if (form?.dataset?.semEspera !== undefined) return;
      mostrar();
    };

    const aoClicar = (e: MouseEvent) => {
      // Navegação interna também demora: as telas do painel são dinâmicas e
      // consultam o banco a cada abertura.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const link = (e.target as HTMLElement)?.closest?.('a');
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href || !href.startsWith('/') || link.target === '_blank') return;
      if (href === caminho) return;
      mostrar();
    };

    // Voltar pelo histórico devolve a página pronta — nada a esperar.
    const aoVoltar = () => esconder();

    // Ação que falha não re-renderiza o layout: quem avisa é a fronteira de
    // erro. Sem este canal, o aviso ficava por cima da mensagem de erro.
    const aoTerminar = () => esconder();

    // Saída pelo teclado, sempre. Um aviso que não fecha é pior que nenhum.
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') esconder();
    };

    document.addEventListener('submit', aoEnviar, true);
    document.addEventListener('click', aoClicar, true);
    window.addEventListener('pageshow', aoVoltar);
    window.addEventListener('cpa:acao-terminou', aoTerminar);
    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('submit', aoEnviar, true);
      document.removeEventListener('click', aoClicar, true);
      window.removeEventListener('pageshow', aoVoltar);
      window.removeEventListener('cpa:acao-terminou', aoTerminar);
      document.removeEventListener('keydown', aoTeclar);
      limpar();
    };
  }, [caminho]);

  if (!visivel) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/25 backdrop-blur-[2px]"
    >
      <div className="mx-6 flex max-w-sm flex-col items-center rounded-2xl border border-brand-navy/10 bg-white px-8 py-7 shadow-xl">
        <Image
          src="/logo-insted.png"
          alt=""
          width={550}
          height={162}
          className="h-8 w-auto"
          priority
        />

        <div className="mt-5 flex items-center gap-3">
          <span
            aria-hidden
            className="h-4 w-4 animate-spin rounded-full border-2 border-brand-teal/25 border-t-brand-teal motion-reduce:animate-none"
          />
          <p className="text-sm font-semibold text-brand-navy">Processando…</p>
        </div>

        <p className="mt-2 text-center text-xs text-slate-500">
          {demorado
            ? 'Isto está levando mais que o normal. Importação e geração de tarefas percorrem milhares de registros — não feche a página.'
            : 'Um instante.'}
        </p>

        <p className="mt-3 text-[11px] text-slate-400">Esc fecha este aviso.</p>
      </div>
    </div>
  );
}
