/**
 * Apoio à pré-visualização do que um respondente vê.
 *
 * Fica à parte de `condicao.ts` de propósito: aquele módulo é a regra que o
 * servidor aplica ao SALVAR resposta de aluno, e a pré-visualização só precisa
 * descrevê-la em palavras. Tocar no módulo de produção para isso não vale o
 * risco.
 */
import { lerCondicao, type Condicao } from '@/lib/condicao';

type Pergunta = {
  id: string;
  enunciado: string;
  condicao: unknown;
  opcoes: { id: string; rotulo: string }[];
};

/**
 * "só aparece se a pergunta 3 tiver nota de 0 a 6" — a condição em palavras,
 * para quem confere o formulário sem responder.
 */
export function descreverCondicao(pergunta: Pergunta, doBloco: Pergunta[]): string | null {
  const c: Condicao | null = lerCondicao(pergunta.condicao);
  if (!c) return null;

  const idx = doBloco.findIndex((q) => q.id === c.questionId);
  // Condição que aponta para pergunta de OUTRO bloco não é avaliada na tela do
  // respondente (só vale dentro do mesmo card): descreve, mas avisa.
  const quem = idx >= 0 ? `a pergunta ${idx + 1}` : 'uma pergunta de outro card';

  switch (c.operador) {
    case 'entre': {
      const [min, max] = Array.isArray(c.valor) ? (c.valor as number[]) : [c.valor, c.valor];
      return `só aparece se ${quem} tiver nota de ${min} a ${max}`;
    }
    case 'eq':
      return `só aparece se ${quem} for igual a ${String(c.valor)}`;
    case 'ne':
      return `só aparece se ${quem} for diferente de ${String(c.valor)}`;
    case 'lte':
      return `só aparece se ${quem} for no máximo ${String(c.valor)}`;
    case 'gte':
      return `só aparece se ${quem} for no mínimo ${String(c.valor)}`;
    case 'em': {
      const ids = Array.isArray(c.valor) ? c.valor.map(String) : [];
      const controle = doBloco.find((q) => q.id === c.questionId);
      const rotulos = ids.map((id) => controle?.opcoes.find((o) => o.id === id)?.rotulo ?? id);
      return `só aparece se ${quem} tiver marcado: ${rotulos.join(' ou ')}`;
    }
    default:
      return null;
  }
}
