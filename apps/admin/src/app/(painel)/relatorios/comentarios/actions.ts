'use server';

/**
 * Moderação dos comentários abertos.
 *
 * Texto livre é o único lugar da avaliação em que alguém pode se identificar
 * ou identificar outra pessoa — um aluno que assina o próprio nome, um
 * comentário que cita um colega, uma ofensa dirigida a um professor. Por isso
 * o comentário não chega ao relatório antes de alguém da comissão ler.
 *
 * Ocultar NÃO apaga: o texto continua no banco e na exportação da CPA. Apagar
 * resposta de avaliação é adulterar resultado, e a comissão precisa poder
 * rever a própria decisão depois — inclusive diante de quem reclamar dela.
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@insted/database';
import type { StatusModeracao } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

/** Decisões que a tela oferece. "PENDENTE" é o desfazer. */
const DECISOES: StatusModeracao[] = ['APROVADO', 'OCULTO', 'PENDENTE'];

async function aplicar(ids: string[], decisao: StatusModeracao, moderadorId: string) {
  if (ids.length === 0) return 0;

  const { count } = await prisma.answer.updateMany({
    where: {
      id: { in: ids },
      // Trava de escopo: só texto livre é moderado. Sem isto, um id forjado
      // marcaria uma resposta de escala como "oculta" — sem efeito visível
      // hoje, mas sujando o dado para quem for confiar nessa coluna depois.
      question: { tipo: 'TEXTO_LIVRE' },
    },
    data: {
      moderacao: decisao,
      // Volta para pendente é desfazer: não deixa rastro de quem leu, porque
      // ninguém leu ainda do ponto de vista do relatório.
      moderadoEm: decisao === 'PENDENTE' ? null : new Date(),
      moderadoPorId: decisao === 'PENDENTE' ? null : moderadorId,
    },
  });

  return count;
}

export async function moderarComentario(
  decisao: StatusModeracao,
  dados: FormData,
): Promise<void> {
  const eu = await exigirPainel();
  if (!DECISOES.includes(decisao)) throw new Error('Decisão desconhecida.');

  await aplicar([String(dados.get('answerId') ?? '')], decisao, eu.id);
  revalidatePath('/relatorios/comentarios');
}

/**
 * Mesma decisão para vários comentários de uma vez.
 *
 * A fila de um ciclo grande tem centenas de linhas, e a maioria é elogio ou
 * crítica comum, sem nada a esconder. Sem o lote, moderar vira trabalho de
 * clicar — e o que não se consegue fazer acaba não sendo feito.
 */
export async function moderarEmLote(decisao: StatusModeracao, dados: FormData): Promise<void> {
  const eu = await exigirPainel();
  if (!DECISOES.includes(decisao)) throw new Error('Decisão desconhecida.');

  const ids = dados.getAll('ids').map(String).filter(Boolean);
  if (ids.length === 0) throw new Error('Selecione ao menos um comentário.');

  const total = await aplicar(ids, decisao, eu.id);

  // Decisão em lote fica registrada: é a que some mais rápido da memória de
  // quem fez, e a que mais precisa ser explicada depois.
  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'COMMENT_MODERATE_BULK',
      entidade: 'Answer',
      dadosDepois: { decisao, total, ids: ids.slice(0, 200) },
    },
  });

  revalidatePath('/relatorios/comentarios');
}
