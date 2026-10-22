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
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const e = err as { digest?: unknown; message?: unknown } | null;
  if (!e || typeof e.digest !== 'string' || typeof e.message !== 'string') return;
  const digest: string = e.digest;
  const mensagem: string = e.message;

  // redirect() e notFound() também chegam como erro; não são falha.
  if (digest.startsWith('NEXT_')) return;

  // Só Error simples: os do Prisma, do driver e da plataforma são subclasses.
  const simples = Object.getPrototypeOf(err) === Error.prototype;
  if (!simples) return;

  try {
    const { prisma } = await import('@insted/database');
    await prisma.auditLog.create({
      data: {
        acao: 'ERRO_ACAO',
        entidade: 'Erro',
        dadosDepois: {
          digest,
          mensagem: mensagem.slice(0, 500),
          rota: context.routePath,
          tipo: context.routeType,
        },
      },
    });
  } catch {
    // Falhar ao registrar não pode esconder o erro original nem gerar outro.
  }
}
