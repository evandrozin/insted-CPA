'use client';

/**
 * Recarrega os dados da página de tempos em tempos.
 *
 * Existe para a tela de adesão, que é olhada durante a campanha — às vezes
 * projetada numa reunião. Sem isto, o número congela no instante em que a
 * página abriu e passa a mentir sem avisar.
 *
 * `router.refresh()` busca só os dados do servidor e reaproveita a página: não
 * pisca, não perde a rolagem e não reinicia o relógio do navegador.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function Atualizando({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter();
  const [ligado, setLigado] = useState(true);
  const [quando, setQuando] = useState<string>('');

  useEffect(() => {
    // Hora formatada só no cliente: o relógio do servidor renderizaria um
    // horário diferente do navegador e o React reclamaria da diferença.
    setQuando(new Date().toLocaleTimeString('pt-BR'));
    if (!ligado) return;

    const id = setInterval(() => {
      router.refresh();
      setQuando(new Date().toLocaleTimeString('pt-BR'));
    }, segundos * 1000);

    return () => clearInterval(id);
  }, [ligado, segundos, router]);

  return (
    <div className="flex items-center gap-3 text-[11px] text-slate-400">
      <span>
        {ligado ? `Atualiza sozinho a cada ${segundos}s` : 'Atualização pausada'}
        {quando && ` · ${quando}`}
      </span>
      <button
        type="button"
        onClick={() => setLigado((v) => !v)}
        className="rounded-lg border border-brand-navy/10 bg-white px-2 py-0.5 font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
      >
        {ligado ? 'Pausar' : 'Retomar'}
      </button>
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setQuando(new Date().toLocaleTimeString('pt-BR'));
        }}
        className="rounded-lg border border-brand-navy/10 bg-white px-2 py-0.5 font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
      >
        Atualizar agora
      </button>
    </div>
  );
}
