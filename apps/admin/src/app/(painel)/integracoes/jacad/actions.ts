'use server';

/**
 * Execução da importação pelo painel.
 *
 * Roda no processo do servidor, não numa fila — o que impõe um limite real:
 * cada botão precisa terminar dentro do tempo de uma requisição. Períodos,
 * cursos e turmas levam segundos; matrículas, um a dois minutos.
 *
 * **Disciplinas não tem botão**, e não é esquecimento: são 1.884 chamadas em
 * sequência com pausa de rate limit, horas de execução. Botão para isso ou
 * estoura o tempo da requisição ou ocupa o servidor inteiro; ele fica no CLI
 * até existir fila de verdade.
 *
 * Duas condições precisam valer no ambiente onde o painel roda:
 *
 *   1. `JACAD_TOKEN` definido;
 *   2. o IP de saída liberado no JACAD.
 *
 * A segunda é a que costuma faltar em serverless, onde o IP muda a cada
 * execução. Quando falta, o JACAD responde 403 e a mensagem abaixo diz isso
 * em vez de repetir "erro na chamada".
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@insted/database';
import type { JacadRecurso } from '@insted/database';
import {
  ConciliadorDocentes,
  JacadError,
  JacadIngest,
  JacadPromotor,
  clienteDoAmbiente,
} from '@insted/jacad';
import { exigirPainel } from '@/lib/sessao';

function exigirToken(): void {
  if (!process.env.JACAD_TOKEN) {
    throw new Error(
      'JACAD_TOKEN não está definido neste ambiente. Sem ele não há como falar com a API.',
    );
  }
}

/** Traduz o erro da API para o que a pessoa precisa fazer a respeito. */
function traduzir(e: unknown): never {
  if (e instanceof JacadError) {
    if (e.status === 403 || e.status === 401) {
      throw new Error(
        `O JACAD recusou a chamada (HTTP ${e.status}). As causas usuais são o IP de saída ` +
          'deste servidor não estar liberado na API ou o token estar inválido. ' +
          'Em hospedagem serverless o IP muda a cada execução, e a importação precisa ' +
          'rodar de uma máquina com IP fixo e liberado.',
      );
    }
    throw new Error(`JACAD respondeu HTTP ${e.status}: ${e.message}`);
  }
  throw e;
}

/** Envolve a execução no registro de sincronização, como faz o CLI. */
async function comLog(
  recurso: JacadRecurso,
  referencia: string | null,
  fn: () => Promise<number>,
): Promise<void> {
  const reg = await prisma.jacadSyncLog.create({
    data: { recurso, referencia, status: 'EXECUTANDO' },
  });
  try {
    const total = await fn();
    await prisma.jacadSyncLog.update({
      where: { id: reg.id },
      data: { status: 'CONCLUIDO', totalRegistros: total, concluidoEm: new Date() },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.jacadSyncLog.update({
      where: { id: reg.id },
      data: { status: 'FALHOU', erros: 1, mensagem: msg.slice(0, 1000), concluidoEm: new Date() },
    });
    traduzir(e);
  }
}

const ingest = () => {
  const cliente = clienteDoAmbiente();
  return new JacadIngest(prisma, cliente, () => {});
};

export async function testarConexao(): Promise<void> {
  await exigirPainel();
  exigirToken();
  const r = await clienteDoAmbiente().testarConexao();
  revalidatePath('/integracoes/jacad');
  if (!r.ok) {
    throw new Error(
      r.status === 403 || r.status === 401
        ? `O JACAD recusou a autenticação (HTTP ${r.status}). Confira o token e se o IP deste servidor está liberado.`
        : `Falha ao autenticar (HTTP ${r.status}): ${r.mensagem}`,
    );
  }
}

export async function sincronizarPeriodos(): Promise<void> {
  await exigirPainel();
  exigirToken();
  await comLog('PERIODOS_LETIVOS', null, () => ingest().sincronizarPeriodosLetivos());
  revalidatePath('/integracoes/jacad');
}

export async function sincronizarCursos(): Promise<void> {
  await exigirPainel();
  exigirToken();
  await comLog('CURSOS', null, () => ingest().sincronizarCursos());
  revalidatePath('/integracoes/jacad');
}

export async function sincronizarTurmas(dados: FormData): Promise<void> {
  await exigirPainel();
  exigirToken();
  const ano = Number(dados.get('ano')) || undefined;
  await comLog('TURMAS', ano ? `ano=${ano}` : null, () => ingest().sincronizarTurmas(ano));
  revalidatePath('/integracoes/jacad');
}

export async function sincronizarMatriculas(dados: FormData): Promise<void> {
  await exigirPainel();
  exigirToken();
  const periodo = Number(dados.get('periodo'));
  if (!periodo) throw new Error('Escolha o período letivo.');
  await comLog('MATRICULAS', `periodo=${periodo}`, () => ingest().sincronizarMatriculas(periodo));
  revalidatePath('/integracoes/jacad');
}

export async function conciliarDocentes(dados: FormData): Promise<void> {
  await exigirPainel();
  exigirToken();
  const periodo = Number(dados.get('periodo')) || undefined;
  const c = new ConciliadorDocentes(prisma, clienteDoAmbiente(), () => {});
  try {
    await c.conciliar(periodo);
  } catch (e) {
    traduzir(e);
  }
  revalidatePath('/integracoes/jacad');
}

export async function promover(dados: FormData): Promise<void> {
  await exigirPainel();
  const periodo = Number(dados.get('periodo'));
  if (!periodo) throw new Error('Escolha o período letivo.');

  // Promoção não fala com a API: lê o staging e escreve nas entidades do CPA.
  // Por isso não exige token nem IP liberado.
  await new JacadPromotor(prisma, () => {}).promover(periodo);
  revalidatePath('/integracoes/jacad');
  revalidatePath('/cadastros/usuarios');
}
