/**
 * O ciclo de egressos aberto agora, com o formulário e as perguntas.
 *
 * Fica fora de `actions.ts` porque tudo que um arquivo 'use server' exporta vira
 * endpoint público; isto é só leitura para a página e para a ação.
 */
import { prisma } from '@insted/database';

/** O ciclo de egressos aberto agora, com o formulário e suas perguntas. */
export async function cicloDeEgressos() {
  return prisma.evaluationPeriod.findFirst({
    where: {
      status: 'ABERTO',
      fechaEm: { gte: new Date() },
      formularios: { some: { publico: 'EGRESSO' } },
    },
    orderBy: { abreEm: 'desc' },
    select: {
      id: true,
      nome: true,
      mensagemBoasVindas: true,
      mensagemConclusao: true,
      formularios: {
        where: { publico: 'EGRESSO' },
        select: {
          id: true,
          anonimo: true,
          form: {
            select: {
              nome: true,
              blocos: {
                orderBy: { ordem: 'asc' },
                select: {
                  id: true,
                  titulo: true,
                  descricao: true,
                  targetType: true,
                  questoes: {
                    where: { ativa: true },
                    orderBy: { ordem: 'asc' },
                    select: {
                      id: true,
                      enunciado: true,
                      ajuda: true,
                      tipo: true,
                      config: true,
                      obrigatoria: true,
                      condicao: true,
                      opcoes: { orderBy: { ordem: 'asc' }, select: { id: true, rotulo: true } },
                    },
                  },
                },
              },
            },
          },
        },
        take: 1,
      },
    },
  });
}
