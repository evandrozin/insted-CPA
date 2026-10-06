'use server';

/**
 * Ações sobre o formulário inteiro: arquivar e excluir.
 *
 * Existem porque duplicar é barato e errar também: a CPA cria uma versão para
 * testar, outra sem querer, e a lista passa a ter três instrumentos de mesmo
 * nome que ninguém distingue na hora de montar o ciclo.
 *
 * As duas saídas são diferentes de propósito:
 *
 * - ARQUIVAR tira da escolha sem apagar nada. É o que serve para versão antiga
 *   que já foi usada: o ciclo que a aplicou continua intacto, e o relatório
 *   daquele ano continua sabendo o que foi perguntado.
 * - EXCLUIR só vale para rascunho que nunca foi a lugar nenhum. Formulário
 *   com ciclo ou com resposta não é apagado por aqui — apagar o instrumento
 *   deixaria respostas órfãs e um resultado que ninguém consegue interpretar.
 */
import { revalidatePath } from 'next/cache';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

/** Arquiva (some das escolhas) ou devolve o formulário para publicado. */
export async function alternarArquivo(formId: string): Promise<void> {
  const eu = await exigirPainel();

  const form = await prisma.formTemplate.findUnique({
    where: { id: formId },
    select: {
      status: true,
      nome: true,
      versao: true,
      periodForms: {
        select: { period: { select: { nome: true, status: true } } },
      },
    },
  });
  if (!form) throw new Error('Formulário não encontrado.');

  if (form.status === 'RASCUNHO') {
    throw new Error('Rascunho não se arquiva: publique, ou exclua se foi engano.');
  }

  const emUso = form.periodForms.filter((pf) =>
    ['AGENDADO', 'ABERTO'].includes(pf.period.status),
  );
  if (form.status === 'PUBLICADO' && emUso.length > 0) {
    throw new Error(
      `Está em uso no ciclo "${emUso[0].period.nome}", que não encerrou. ` +
        'Arquivar agora esconderia da CPA o instrumento que está na mão dos respondentes.',
    );
  }

  const novo = form.status === 'ARQUIVADO' ? 'PUBLICADO' : 'ARQUIVADO';

  await prisma.formTemplate.update({ where: { id: formId }, data: { status: novo } });
  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: novo === 'ARQUIVADO' ? 'FORM_ARCHIVE' : 'FORM_UNARCHIVE',
      entidade: 'FormTemplate',
      entidadeId: formId,
      dadosDepois: { nome: form.nome, versao: form.versao, status: novo },
    },
  });

  revalidatePath('/formularios');
  revalidatePath(`/formularios/${formId}`);
}

/**
 * Apaga um rascunho que não foi usado.
 *
 * As três recusas abaixo não são burocracia: cada uma corresponde a um dado
 * que sumiria junto e que ninguém conseguiria reconstruir depois.
 */
export async function excluirFormulario(formId: string): Promise<void> {
  const eu = await exigirPainel();

  const form = await prisma.formTemplate.findUnique({
    where: { id: formId },
    select: {
      nome: true,
      versao: true,
      status: true,
      periodForms: { select: { period: { select: { nome: true } } } },
      _count: { select: { blocos: true } },
    },
  });
  if (!form) throw new Error('Formulário não encontrado.');

  if (form.status !== 'RASCUNHO') {
    throw new Error(
      'Só rascunho pode ser excluído. Instrumento publicado é a prova do que foi ' +
        'perguntado — use "arquivar" para tirá-lo das escolhas.',
    );
  }

  if (form.periodForms.length > 0) {
    throw new Error(
      `Está vinculado ao ciclo "${form.periodForms[0].period.nome}". ` +
        'Remova o vínculo no ciclo antes de excluir.',
    );
  }

  const respostas = await prisma.responseSet.count({
    where: { periodForm: { formId } },
  });
  if (respostas > 0) {
    throw new Error(
      `Já tem ${respostas} resposta(s) enviadas. Apagar o formulário deixaria as ` +
        'respostas sem a pergunta que as originou.',
    );
  }

  // Blocos, questões e alternativas caem em cascata — é o mesmo caminho que a
  // reimportação de um rascunho já usa.
  await prisma.formTemplate.delete({ where: { id: formId } });
  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'FORM_DELETE',
      entidade: 'FormTemplate',
      entidadeId: formId,
      dadosAntes: { nome: form.nome, versao: form.versao, blocos: form._count.blocos },
    },
  });

  revalidatePath('/formularios');
}
