/**
 * Publicação de formulário.
 *
 * Fica no pacote do banco pelo mesmo motivo de `comissao.ts`: a tela publica,
 * e um script de ambiente também precisa publicar. Regra duplicada é regra
 * que diverge — e esta em particular não pode divergir, porque é ela que
 * decide o que fica congelado para a série histórica.
 */
import type { PrismaClient } from '@prisma/client';

export type ResultadoPublicacao = {
  nome: string;
  blocos: number;
  questoes: number;
};

/**
 * Congela o instrumento e grava o snapshot.
 *
 * Publicar é o ponto sem volta: a partir daqui a edição é recusada. É isso que
 * dá sentido à comparação entre anos — uma média de 2026 só se compara com a
 * de 2027 se a pergunta for exatamente a mesma, e "exatamente" precisa ser
 * verificável anos depois.
 *
 * Daí o snapshot, que o schema prometia desde o início e nada preenchia. Sem
 * ele, reconstruir o que foi perguntado dependeria de as linhas de `questions`
 * jamais terem sido tocadas — o que a imutabilidade garante, mas só enquanto
 * ninguém mexer no banco por fora.
 */
export async function publicarFormulario(
  prisma: PrismaClient,
  formId: string,
): Promise<ResultadoPublicacao> {
  const form = await prisma.formTemplate.findUnique({
    where: { id: formId },
    include: {
      blocos: {
        orderBy: { ordem: 'asc' },
        include: {
          questoes: {
            orderBy: { ordem: 'asc' },
            include: { opcoes: { orderBy: { ordem: 'asc' } } },
          },
        },
      },
    },
  });

  if (!form) throw new Error('Formulário não encontrado.');
  if (form.status !== 'RASCUNHO') throw new Error('Este formulário já foi publicado.');

  const totalQuestoes = form.blocos.reduce((n, b) => n + b.questoes.length, 0);
  if (totalQuestoes === 0) {
    throw new Error('Formulário sem questões. Adicione ao menos uma antes de publicar.');
  }

  // Bloco vazio geraria um card em branco para o respondente — ele abriria a
  // etapa e não teria o que responder.
  const vazios = form.blocos.filter((b) => b.questoes.length === 0);
  if (vazios.length > 0) {
    throw new Error(
      `Bloco sem questão: ${vazios.map((b) => `"${b.titulo}"`).join(', ')}. ` +
        'Ele geraria um card em branco para o respondente.',
    );
  }

  const agora = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.formTemplate.update({
      where: { id: formId },
      data: {
        status: 'PUBLICADO',
        publicadoEm: agora,
        snapshot: {
          publicadoEm: agora.toISOString(),
          nome: form.nome,
          publico: form.publico,
          versao: form.versao,
          blocos: form.blocos.map((b) => ({
            titulo: b.titulo,
            descricao: b.descricao,
            ordem: b.ordem,
            targetType: b.targetType,
            repetivel: b.repetivel,
            targetFiltro: b.targetFiltro,
            obrigatorio: b.obrigatorio,
            questoes: b.questoes.map((q) => ({
              enunciado: q.enunciado,
              ajuda: q.ajuda,
              tipo: q.tipo,
              ordem: q.ordem,
              obrigatoria: q.obrigatoria,
              // Decimal não sobrevive a JSON: vira string, que é o formato
              // exato e reversível.
              peso: q.peso.toString(),
              config: q.config,
              opcoes: q.opcoes.map((o) => ({
                rotulo: o.rotulo,
                valor: o.valor,
                ordem: o.ordem,
              })),
            })),
          })),
        },
      },
    });

    await tx.auditLog.create({
      data: {
        acao: 'FORMULARIO_PUBLICADO',
        entidade: 'FormTemplate',
        entidadeId: formId,
        dadosDepois: {
          nome: form.nome,
          versao: form.versao,
          blocos: form.blocos.length,
          questoes: totalQuestoes,
        },
      },
    });
  });

  return { nome: form.nome, blocos: form.blocos.length, questoes: totalQuestoes };
}
