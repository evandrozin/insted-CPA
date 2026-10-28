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
import { redirect, unstable_rethrow } from 'next/navigation';
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
import { ipDeSaida } from '@/lib/ip-saida';

const TELA = '/integracoes/jacad';

/** Falha ao falar com o JACAD, já em português, com o status HTTP que a causou. */
class FalhaJacad extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
  }
}

/**
 * Roda uma ação de importação e, se falhar, VOLTA PARA A TELA com o motivo e o IP.
 *
 * Por que não deixar o erro subir: em produção o Next troca a mensagem de qualquer
 * erro de Server Action por um texto genérico, e a que o painel recupera depois
 * (instrumentation.ts) é gravada em segundo plano — no Vercel isso pode ser cortado
 * quando a função termina. Para a importação isso não serve, porque a pessoa
 * precisa ler o erro na hora para decidir o que fazer. Redirecionar com a mensagem
 * na URL não depende de nada disso. A mensagem só carrega status HTTP e frases do
 * JACAD — nunca nome de aluno nem token.
 */
async function comFalhaVisivel(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    // redirect() e notFound() são exceções de controle do Next: seguem adiante.
    unstable_rethrow(e);

    const status =
      e instanceof FalhaJacad || e instanceof JacadError ? e.status : null;
    const traduzida = e instanceof JacadError ? mensagemDoJacad(e) : null;
    // Só o que NÓS escrevemos aparece; erro de banco ou da plataforma fica genérico.
    const nosso =
      e instanceof FalhaJacad || (e instanceof Error && Object.getPrototypeOf(e) === Error.prototype);

    const params = new URLSearchParams({
      erro: (traduzida ?? (nosso && e instanceof Error ? e.message : 'Falha inesperada na importação.')).slice(0, 500),
    });
    if (status !== null) params.set('status', String(status));

    // O que o JACAD enxerga. Sempre mostrado: é o dado que a CPA precisa para saber
    // se o bloqueio é de IP ou de token.
    const ip = await ipDeSaida();
    if (ip) params.set('ip', ip);

    redirect(`${TELA}?${params}`);
  }
}

function exigirToken(): void {
  if (!process.env.JACAD_TOKEN) {
    throw new Error(
      'JACAD_TOKEN não está definido neste ambiente. Sem ele não há como falar com a API.',
    );
  }
}

/** A frase de erro, em português, para o que o JACAD respondeu. */
function mensagemDoJacad(e: JacadError): string {
  if (e.status === 403 || e.status === 401) {
    return (
      `O JACAD recusou a chamada (HTTP ${e.status}). As causas usuais são o IP de saída ` +
      'deste servidor não estar liberado na API ou o token estar inválido. ' +
      'Em hospedagem serverless o IP muda a cada execução, e a importação precisa ' +
      'rodar de uma máquina com IP fixo e liberado.'
    );
  }
  if (e.status === 422) {
    return (
      'O JACAD não reconheceu o token (HTTP 422). O valor de JACAD_TOKEN deste ambiente está ' +
      'diferente do correto — o erro é do token, não do IP.'
    );
  }
  if (e.status === 0) {
    return `Não foi possível falar com o JACAD (timeout ou rede): ${e.message}`;
  }
  return `JACAD respondeu HTTP ${e.status}: ${e.message}`;
}

/** Traduz o erro da API para o que a pessoa precisa fazer a respeito. */
function traduzir(e: unknown): never {
  if (e instanceof JacadError) throw new FalhaJacad(mensagemDoJacad(e), e.status);
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
  await comFalhaVisivel(async () => {
  exigirToken();
  const r = await clienteDoAmbiente().testarConexao();
  revalidatePath('/integracoes/jacad');
  if (!r.ok) {
    throw new FalhaJacad(
      r.status === 422
        ? // 422: a chamada chegou e o JACAD não reconheceu o valor. Não é o IP —
          // um IP bloqueado nem chega a ler o token.
          `O JACAD não reconheceu o token (HTTP 422${r.detalhe ? `: "${r.detalhe}"` : ''}). ` +
            'O valor de JACAD_TOKEN deste ambiente está diferente do correto: cole-o inteiro, ' +
            'sem aspas, espaço ou quebra de linha, e publique de novo — o Vercel só aplica ' +
            'uma variável alterada em um deploy novo.'
        : r.status === 403 || r.status === 401
          ? `O JACAD recusou a autenticação (HTTP ${r.status}). Confira o token e se o IP deste servidor está liberado.`
          : `Falha ao autenticar (HTTP ${r.status}): ${r.mensagem}`,
      r.status,
    );
  }
  });
}

export async function sincronizarPeriodos(): Promise<void> {
  await exigirPainel();
  await comFalhaVisivel(async () => {
    exigirToken();
    await comLog('PERIODOS_LETIVOS', null, () => ingest().sincronizarPeriodosLetivos());
  });
  revalidatePath('/integracoes/jacad');
}

export async function sincronizarCursos(): Promise<void> {
  await exigirPainel();
  await comFalhaVisivel(async () => {
    exigirToken();
    await comLog('CURSOS', null, () => ingest().sincronizarCursos());
  });
  revalidatePath('/integracoes/jacad');
}

export async function sincronizarTurmas(dados: FormData): Promise<void> {
  await exigirPainel();
  await comFalhaVisivel(async () => {
    exigirToken();
    const ano = Number(dados.get('ano')) || undefined;
    await comLog('TURMAS', ano ? `ano=${ano}` : null, () => ingest().sincronizarTurmas(ano));
  });
  revalidatePath('/integracoes/jacad');
}

export async function sincronizarMatriculas(dados: FormData): Promise<void> {
  await exigirPainel();
  await comFalhaVisivel(async () => {
    exigirToken();
    const periodo = Number(dados.get('periodo'));
    if (!periodo) throw new Error('Escolha o período letivo.');
    await comLog('MATRICULAS', `periodo=${periodo}`, () => ingest().sincronizarMatriculas(periodo));
  });
  revalidatePath('/integracoes/jacad');
}

export async function conciliarDocentes(dados: FormData): Promise<void> {
  await exigirPainel();
  await comFalhaVisivel(async () => {
    exigirToken();
    const periodo = Number(dados.get('periodo')) || undefined;
    const c = new ConciliadorDocentes(prisma, clienteDoAmbiente(), () => {});
    try {
      await c.conciliar(periodo);
    } catch (e) {
      traduzir(e);
    }
  });
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
