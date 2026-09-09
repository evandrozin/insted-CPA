/**
 * Diagnóstico de ambiente.
 *
 *   GET /saude
 *
 * Existe porque em build de produção o Next omite a mensagem de erro — e com
 * razão, ela pode conter dado sensível. O efeito colateral é que uma falha de
 * configuração aparece como "ocorreu um erro no render", que não diz o que
 * configurar. Esta rota responde exatamente isso, sem revelar nada.
 *
 * O que ela NÃO mostra: valores de segredo, senha, URL completa de banco. Só
 * presença, comprimento e host — o suficiente para distinguir "variável
 * ausente" de "banco inacessível", que é a dúvida que trava um deploy.
 *
 * Antes de produção, restrinja ou remova: mesmo sem segredos, ela confirma a
 * existência do ambiente e o host do banco para quem perguntar.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@insted/database';

export const dynamic = 'force-dynamic';

/** Host e porta de uma URL de conexão, sem usuário nem senha. */
function hostDe(url: string | undefined): string {
  if (!url) return '(ausente)';
  const m = url.match(/@([^/?]+)/);
  return m ? m[1] : '(formato irreconhecível)';
}

export async function GET() {
  const segredo = process.env.SESSION_SECRET ?? process.env.JWT_ACCESS_SECRET ?? '';

  const relatorio: Record<string, unknown> = {
    ambiente: process.env.NODE_ENV,
    sessao: {
      // O login falha ANTES de tocar no banco se este segredo faltar — é a
      // primeira coisa a conferir quando não há nenhum LOGIN na auditoria.
      configurado: segredo.length >= 16,
      origem: process.env.SESSION_SECRET
        ? 'SESSION_SECRET'
        : process.env.JWT_ACCESS_SECRET
          ? 'JWT_ACCESS_SECRET (reserva)'
          : '(nenhuma)',
      caracteres: segredo.length,
    },
    banco: {
      host: hostDe(process.env.DATABASE_URL),
      pooler: (process.env.DATABASE_URL ?? '').includes('pgbouncer=true'),
    },
  };

  try {
    const [usuarios, contasPainel, formularios, ciclos] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: { in: ['ADMIN', 'GESTOR'] }, deletadoEm: null } }),
      prisma.formTemplate.count(),
      prisma.evaluationPeriod.count(),
    ]);
    relatorio.banco = {
      ...(relatorio.banco as object),
      conectou: true,
      usuarios,
      contasPainel,
      formularios,
      ciclos,
    };
  } catch (e) {
    relatorio.banco = {
      ...(relatorio.banco as object),
      conectou: false,
      // A mensagem do Prisma nomeia o host, nunca a credencial.
      erro: (e as Error).message.split('\n')[0].slice(0, 300),
    };
  }

  const b = relatorio.banco as { conectou?: boolean; contasPainel?: number };
  const s = relatorio.sessao as { configurado: boolean };
  relatorio.pronto = Boolean(s.configurado && b.conectou && (b.contasPainel ?? 0) > 0);

  return NextResponse.json(relatorio, {
    status: relatorio.pronto ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
