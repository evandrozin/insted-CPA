/**
 * Lista nominal de respondentes em CSV.
 *
 *   /periodos/<id>/respondentes/csv?status=PENDENTE&q=
 *
 * Serve à cobrança: quem vai disparar o aviso precisa de nome, matrícula e
 * e-mail numa planilha, não de uma tela paginada de 25 em 25.
 *
 * Exporta QUEM respondeu, nunca O QUE foi respondido — são tabelas
 * diferentes, sem chave entre elas, e é essa separação que sustenta o
 * anonimato. Ainda assim é dado pessoal de centenas de pessoas: o arquivo é
 * da CPA, não para circular.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/** Escapa um campo de CSV: aspas dobradas e o todo entre aspas. */
function campo(v: string | null | undefined): string {
  const t = (v ?? '').replace(/"/g, '""');
  return `"${t}"`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await exigirPainel();
  const { id } = await params;

  const sp = req.nextUrl.searchParams;
  const status = sp.get('status') ?? 'TODOS';
  const q = (sp.get('q') ?? '').trim();

  const ciclo = await prisma.evaluationPeriod.findUnique({
    where: { id },
    select: { nome: true, ano: true },
  });
  if (!ciclo) return new NextResponse('Ciclo não encontrado.', { status: 404 });

  const tarefas = await prisma.evaluationTask.findMany({
    where: {
      periodId: id,
      ...(status === 'TODOS' ? {} : { status: status as 'CONCLUIDA' | 'PENDENTE' }),
      ...(q
        ? {
            respondent: {
              OR: [
                { nome: { contains: q, mode: 'insensitive' as const } },
                { matricula: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          }
        : {}),
    },
    orderBy: { respondent: { nome: 'asc' } },
    select: {
      status: true,
      concluidaEm: true,
      respondent: {
        select: { nome: true, matricula: true, email: true, role: true },
      },
      _count: { select: { alvos: true } },
    },
  });

  const linhas = [
    ['Matrícula', 'Nome', 'E-mail', 'Perfil', 'Situação', 'Cards', 'Enviado em']
      .map(campo)
      .join(';'),
    ...tarefas.map((t) =>
      [
        campo(t.respondent.matricula),
        campo(t.respondent.nome),
        // Endereço provisório não serve para aviso: quem for cobrar precisa
        // ver isso na planilha, não descobrir pelo e-mail que volta.
        campo(
          t.respondent.email.endsWith('@sem-email.insted.local')
            ? 'SEM E-MAIL'
            : t.respondent.email,
        ),
        campo(t.respondent.role),
        campo(t.status === 'CONCLUIDA' ? 'Respondeu' : 'Não respondeu'),
        campo(String(t._count.alvos)),
        campo(t.concluidaEm ? t.concluidaEm.toLocaleString('pt-BR') : ''),
      ].join(';'),
    ),
  ];

  // BOM para o Excel abrir com acento certo; ponto e vírgula porque é o
  // separador que o Excel em português espera.
  const csv = '﻿' + linhas.join('\r\n') + '\r\n';

  const rotulo = status === 'TODOS' ? 'todos' : status.toLowerCase();
  const arquivo = `respondentes-${ciclo.ano}-${rotulo}.csv`;

  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${arquivo}"`,
      'cache-control': 'no-store',
    },
  });
}
