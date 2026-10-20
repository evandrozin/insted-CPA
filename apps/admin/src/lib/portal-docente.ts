/**
 * Leitura dos parâmetros que o portal do PROFESSOR do JACAD manda para o CPA.
 *
 * O portal monta o link a partir de tags (`<id_perfil>`, `<email>`…) e só sabe
 * duas coisas: mandar o texto puro ou em Base 64. Nenhuma das duas autentica —
 * quem decodifica, troca e recodifica entra no lugar de outro. É o mesmo risco
 * já aceito pela CPA no link dos alunos (docs/08-autenticacao-jacad.md); estas
 * funções só leem o parâmetro, não o tornam confiável.
 *
 * Por que `id_perfil` e não as outras tags:
 *
 * - `<id_perfil>` é o número da PESSOA no JACAD, o mesmo `idPerfil` que a
 *   conciliação de docentes já grava: a matrícula do docente no CPA é
 *   `JACAD-P-<idPerfil>`. Não exige tabela nova nem consulta ao JACAD.
 * - `<id_professor>` e `<id_funcionario>` são o vínculo, não a pessoa, e o
 *   CPA não os guarda — usá-los pediria nova importação.
 * - `<cpf>` identificaria bem, mas é dado pessoal que passaria na URL, no
 *   histórico do navegador e em log de proxy. Não é aceito aqui, de propósito.
 * - `<nome>` não é único. `<email>` serve de segundo fator, não de chave:
 *   pode divergir entre o portal e o cadastro de contato.
 */

/** O que pode ter chegado: o texto como veio e, se decodificar, o Base 64 dele. */
function leituras(valor: string): string[] {
  const bruto = valor.trim();
  if (!bruto) return [];

  const lidas = new Set<string>([bruto]);
  try {
    // `+` é caractere válido do alfabeto Base 64 e o parser de query string o
    // converte em espaço; sem desfazer, o valor decodifica errado.
    lidas.add(Buffer.from(bruto.replace(/ /g, '+'), 'base64').toString('utf8').trim());
  } catch {
    /* segue com o texto puro */
  }
  return [...lidas];
}

/**
 * Candidatos a idPerfil: só dígitos. Duas leituras diferentes podem ser ambas
 * numéricas (raro); quem desempata é o banco, e duas pessoas diferentes viram
 * recusa por ambiguidade em vez de um palpite.
 */
export function idsDePerfil(valor: string): string[] {
  return leituras(valor).filter((t) => /^\d{1,12}$/.test(t));
}

/** Candidatos a e-mail, em minúsculas. */
export function emailsDe(valor: string): string[] {
  return leituras(valor)
    .map((t) => t.toLowerCase())
    .filter((t) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) && t.length <= 254);
}

/** Como o importador grava a matrícula de um docente conciliado. */
export const matriculaDoDocente = (idPerfil: string) => `JACAD-P-${idPerfil}`;

/** `jo***@dominio.com` — o suficiente para diagnosticar sem guardar o e-mail. */
export function mascararEmail(email: string): string {
  const [usuario, dominio = ''] = email.split('@');
  return `${usuario.slice(0, 2)}***@${dominio}`;
}
