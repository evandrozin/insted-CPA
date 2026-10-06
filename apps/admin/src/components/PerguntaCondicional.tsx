'use client';

/**
 * Mostra a pergunta só quando a condição está satisfeita.
 *
 * Observa o campo que controla dentro do mesmo formulário e reage a cada
 * clique. Sem recarregar: o aluno marca 4 na permanência e a pergunta sobre o
 * que atrapalha aparece embaixo, no mesmo instante.
 *
 * Enquanto está escondida, os campos ficam DESABILITADOS — campo desabilitado
 * não é enviado. Sem isso, uma resposta dada antes de mudar de ideia viajaria
 * junto e seria gravada como se a pergunta tivesse aparecido.
 *
 * Isto é conforto, não barreira: quem desligar o JavaScript vê a pergunta
 * sempre. Quem decide o que entra no banco é o servidor, que reavalia a mesma
 * condição ao salvar.
 */
import { useEffect, useRef, useState } from 'react';
import { condicaoSatisfeita, type Condicao, type ValorRespondido } from '@/lib/condicao';

/** Lê do DOM o que está marcado no campo que controla. */
function valorDoCampo(form: HTMLFormElement, campo: string): ValorRespondido | undefined {
  const campos = form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    `[name="${CSS.escape(campo)}"]`,
  );

  const opcoes: string[] = [];
  let valor: ValorRespondido | undefined;

  for (const c of campos) {
    const marcavel = c instanceof HTMLInputElement && (c.type === 'radio' || c.type === 'checkbox');
    if (marcavel && !c.checked) continue;

    const v = c.value;
    if (v === '') continue;

    if (v === '__na__') return { naoSeAplica: true };
    if (v.startsWith('o:')) {
      opcoes.push(v.slice(2));
      continue;
    }
    if (/^-?\d+$/.test(v)) valor = { numerico: Number(v) };
    else if (v === 'sim' || v === 'nao') valor = { booleano: v === 'sim' };
    else valor = { texto: v };
  }

  if (opcoes.length > 0) return { opcoes };
  return valor;
}

export function PerguntaCondicional({
  campoControle,
  condicao,
  className,
  children,
}: {
  campoControle: string;
  condicao: Condicao;
  className?: string;
  children: React.ReactNode;
}) {
  // O componente É o item da lista, e não um invólucro dentro dele: escondendo
  // só o conteúdo, sobraria a linha vazia com borda e espaçamento no meio das
  // perguntas — um buraco que o aluno lê como erro.
  const alvo = useRef<HTMLLIElement>(null);
  // Começa visível: sem JavaScript, o aluno enxerga a pergunta e responde —
  // é melhor perguntar demais do que esconder para sempre.
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const no: HTMLLIElement | null = alvo.current;
    const form = no?.closest('form');
    if (!no || !form) return;

    const avaliar = () => {
      const mostrar = condicaoSatisfeita(condicao, valorDoCampo(form, campoControle));
      setVisivel(mostrar);

      // Desabilitar é o que impede o envio; o `hidden` do React só esconde.
      no.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        'input, textarea, select',
      ).forEach((c) => {
        c.disabled = !mostrar;
      });
    };

    avaliar();
    form.addEventListener('change', avaliar);
    form.addEventListener('input', avaliar);
    return () => {
      form.removeEventListener('change', avaliar);
      form.removeEventListener('input', avaliar);
    };
  }, [campoControle, condicao]);

  return (
    <li ref={alvo} hidden={!visivel} className={className}>
      {children}
    </li>
  );
}
