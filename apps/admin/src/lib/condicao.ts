/**
 * Pergunta condicional: quando uma pergunta só deve aparecer.
 *
 * O instrumento da CPA pede isto em dois lugares: "se a probabilidade de
 * permanecer for de 0 a 6, pergunte o que atrapalha" e "se há algo a melhorar
 * na infraestrutura, pergunte o quê". Perguntar isso a quem respondeu 10
 * desperdiça o tempo de quem responde e suja o resultado com resposta dada
 * por obrigação.
 *
 * A regra vive aqui, sozinha e sem dependências, porque precisa valer nos dois
 * lados: o navegador esconde a pergunta na hora, e o servidor DESCARTA a
 * resposta que chegar sem a condição satisfeita. Se valesse só no navegador,
 * bastaria desligar o JavaScript para gravar resposta que não deveria existir.
 */

export type Operador = 'entre' | 'eq' | 'ne' | 'lte' | 'gte' | 'em';

export type Condicao = {
  /** A pergunta que controla — sempre do mesmo bloco. */
  questionId: string;
  operador: Operador;
  /** Faixa [mín, máx] em "entre"; número nos demais; ids de alternativa em "em". */
  valor: number | number[] | string[];
};

/** O que o respondente marcou, no formato guardado no rascunho. */
export type ValorRespondido = {
  numerico?: number;
  texto?: string;
  booleano?: boolean;
  naoSeAplica?: boolean;
  opcoes?: string[];
};

const OPERADORES: Operador[] = ['entre', 'eq', 'ne', 'lte', 'gte', 'em'];

/** Lê o JSON do banco com desconfiança: ele foi escrito por outra versão. */
export function lerCondicao(v: unknown): Condicao | null {
  if (!v || typeof v !== 'object') return null;
  const c = v as Partial<Condicao>;
  if (typeof c.questionId !== 'string' || !c.questionId) return null;
  if (!c.operador || !OPERADORES.includes(c.operador)) return null;
  if (c.valor === undefined || c.valor === null) return null;
  return { questionId: c.questionId, operador: c.operador, valor: c.valor };
}

/**
 * A condição está satisfeita?
 *
 * Sem resposta na pergunta que controla, a dependente NÃO aparece. É a escolha
 * conservadora: a pergunta condicional existe para aprofundar uma resposta
 * dada, e aprofundar o que ninguém disse não faz sentido.
 *
 * "Não se aplica" também não satisfaz: quem marcou isso não deu nota, e a
 * faixa numérica não tem como ser avaliada.
 */
export function condicaoSatisfeita(
  condicao: Condicao,
  resposta: ValorRespondido | undefined,
): boolean {
  if (!resposta || resposta.naoSeAplica) return false;

  if (condicao.operador === 'em') {
    const aceitos = Array.isArray(condicao.valor) ? condicao.valor.map(String) : [];
    return (resposta.opcoes ?? []).some((o) => aceitos.includes(o));
  }

  const n = resposta.numerico;
  if (typeof n !== 'number') return false;

  if (condicao.operador === 'entre') {
    const [min, max] = Array.isArray(condicao.valor)
      ? (condicao.valor as number[])
      : [Number(condicao.valor), Number(condicao.valor)];
    return n >= Number(min) && n <= Number(max);
  }

  const alvo = Number(Array.isArray(condicao.valor) ? condicao.valor[0] : condicao.valor);
  if (Number.isNaN(alvo)) return false;

  switch (condicao.operador) {
    case 'eq':
      return n === alvo;
    case 'ne':
      return n !== alvo;
    case 'lte':
      return n <= alvo;
    case 'gte':
      return n >= alvo;
    default:
      return false;
  }
}

/** Frase curta para a tela de edição e para o texto de apoio do respondente. */
export function descreverCondicao(
  condicao: Condicao,
  enunciadoDaControle: string,
  rotulosDasOpcoes?: Map<string, string>,
): string {
  const curto =
    enunciadoDaControle.length > 60
      ? `${enunciadoDaControle.slice(0, 60).trimEnd()}…`
      : enunciadoDaControle;

  if (condicao.operador === 'em') {
    const ids = Array.isArray(condicao.valor) ? condicao.valor.map(String) : [];
    const nomes = ids.map((id) => rotulosDasOpcoes?.get(id) ?? id);
    return `Aparece quando "${curto}" for ${nomes.join(' ou ')}`;
  }

  if (condicao.operador === 'entre') {
    const [min, max] = Array.isArray(condicao.valor)
      ? (condicao.valor as number[])
      : [condicao.valor, condicao.valor];
    return `Aparece quando "${curto}" ficar entre ${min} e ${max}`;
  }

  const alvo = Array.isArray(condicao.valor) ? condicao.valor[0] : condicao.valor;
  const frase: Record<Exclude<Operador, 'entre' | 'em'>, string> = {
    eq: `for igual a ${alvo}`,
    ne: `for diferente de ${alvo}`,
    lte: `for ${alvo} ou menos`,
    gte: `for ${alvo} ou mais`,
  };
  return `Aparece quando "${curto}" ${frase[condicao.operador as Exclude<Operador, 'entre' | 'em'>]}`;
}
