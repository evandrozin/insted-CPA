/** Parte do `instrumentation.ts` que só roda em Node (usa o banco). */
import { prisma } from '@insted/database';

export async function registrarErro(
  err: unknown,
  context: { routePath: string; routeType: string },
): Promise<void> {
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
