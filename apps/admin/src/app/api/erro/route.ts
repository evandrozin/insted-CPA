/**
 * Devolve a mensagem real de um erro do painel, pelo código `ref` (digest).
 *
 *   GET /api/erro?ref=3238660741
 *
 * Quem chama é a tela de erro do painel. Só responde a sessão de painel: para
 * aluno e para quem não entrou devolve 401 sem dizer se o código existe — a
 * mensagem pode citar nome e e-mail de quem a CPA estava mexendo.
 *
 * Ver `instrumentation.ts`, que é quem grava.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import { PAPEIS_PAINEL, respondenteAtual } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const eu = await respondenteAtual();
  if (!eu || !PAPEIS_PAINEL.has(eu.role)) {
    return NextResponse.json({ mensagem: null }, { status: 401 });
  }

  const ref = req.nextUrl.searchParams.get('ref') ?? '';
  if (!/^\d{3,20}$/.test(ref)) return NextResponse.json({ mensagem: null }, { status: 400 });

  const registro = await prisma.auditLog.findFirst({
    where: { acao: 'ERRO_ACAO', dadosDepois: { path: ['digest'], equals: ref } },
    orderBy: { criadoEm: 'desc' },
    select: { dadosDepois: true },
  });

  const dados = registro?.dadosDepois as { mensagem?: string } | null;
  return NextResponse.json(
    { mensagem: typeof dados?.mensagem === 'string' ? dados.mensagem : null },
    { headers: { 'cache-control': 'no-store' } },
  );
}
