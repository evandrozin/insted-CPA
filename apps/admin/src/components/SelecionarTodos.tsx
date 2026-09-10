'use client';

/**
 * Marca ou desmarca todas as caixas de uma seleção em lote.
 *
 * Fica no cabeçalho da tabela. Sem ela, selecionar os 25 da página são 25
 * cliques — e o lote existe justamente para não haver cliques repetidos.
 *
 * Alcança as caixas pelo atributo `form`, não pela árvore do DOM: os
 * checkboxes vivem dentro da tabela e o formulário do lote vive acima dela,
 * porque o componente de listagem não permite envolver as linhas.
 */
import { useState } from 'react';

export function SelecionarTodos({ formulario }: { formulario: string }) {
  const [marcado, setMarcado] = useState(false);

  const alternar = (valor: boolean) => {
    setMarcado(valor);
    document
      .querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${formulario}"][name="ids"]`)
      .forEach((c) => {
        c.checked = valor;
      });
  };

  return (
    <input
      type="checkbox"
      checked={marcado}
      onChange={(e) => alternar(e.target.checked)}
      aria-label="Selecionar todos desta página"
      className="h-3.5 w-3.5 cursor-pointer accent-[color:var(--color-brand-teal)]"
    />
  );
}
