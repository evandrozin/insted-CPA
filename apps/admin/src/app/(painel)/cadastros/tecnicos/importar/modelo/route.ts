/**
 * Planilha-modelo para a importação de técnicos. CSV com `;`, que é o que o
 * Excel em português abre sem pedir nada, e BOM para os acentos.
 */
import { exigirPainel } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  await exigirPainel();

  const csv =
    '﻿Nome;E-mail;Matrícula\r\n' +
    'Maria Exemplo da Silva;maria.exemplo@insted.edu.br;\r\n' +
    'João Exemplo Souza;joao.exemplo@insted.edu.br;RH-0123\r\n';

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="modelo-tecnicos.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
