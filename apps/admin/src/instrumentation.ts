/**
 * Guarda a mensagem REAL dos erros que o painel lança, para a tela de erro
 * conseguir mostrá-la.
 *
 * O problema: o painel valida com `throw new Error("ciclo encerrado…")` e conta
 * com a tela de erro para exibir isso. Em build de produção o Next.js troca a
 * mensagem de qualquer erro de Server Action por um texto genérico — e com
 * razão, uma falha de banco poderia vazar detalhe sensível. O resultado era a
 * CPA vendo "An error occurred in the Server Components render…" no lugar do
 * motivo, justamente nas recusas que existem para explicar o que fazer.
 *
 * `onRequestError` é o gancho oficial do Next para isso: recebe o erro ORIGINAL,
 * com o mesmo `digest` (o "ref") que o navegador mostra. Aqui se grava a
 * mensagem na auditoria, pelo digest, e `/api/erro` a devolve — só a quem tem
 * sessão do painel.
 *
 * Só entra o que NÓS escrevemos: `Error` simples. Erro do Prisma, do driver ou
 * da plataforma são subclasses e continuam escondidos, que é o que o Next
 * protege. Quem não é do painel (aluno, login) segue vendo o texto genérico.
 */
export async function onRequestError(
  err: unknown,
  _request: { path: string; method: string },
  context: { routePath: string; routeType: string },
): Promise<void> {
  // `if` positivo em volta do import: é o formato que o webpack reconhece para
  // tirar o código do bundle edge (que não tem node:crypto, usado pelo banco).
  // Com `return` antecipado ele compila o import também para o edge e o
  // servidor de desenvolvimento quebra.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registrarErro } = await import('./instrumentation-node');
    await registrarErro(err, context);
  }
}
