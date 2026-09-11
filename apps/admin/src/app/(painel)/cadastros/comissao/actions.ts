'use server';

/**
 * Gestão das contas da comissão.
 *
 * As regras vivem em `@insted/database` (comissao.ts), compartilhadas com o
 * CLI: o CLI existe para a primeira conta, quando ainda não há ninguém para
 * autenticar; daqui em diante a comissão se administra sozinha, sem terminal.
 *
 * As ações que geram senha devolvem a senha no próprio estado da resposta,
 * para a tela mostrar e esquecer — ver `lib/estado-senha.ts` para o porquê de
 * não haver cofre nem redirecionamento.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, criarConta, redefinirSenha, revogarAcesso } from '@insted/database';
import type { Role } from '@insted/database';
import { exigirAdmin } from '@/lib/sessao';
import type { EstadoSenha } from '@/lib/estado-senha';

/** Erro de regra vira mensagem na janela; o resto sobe para a fronteira de erro. */
function comoErro(anterior: EstadoSenha, e: unknown): EstadoSenha {
  return { n: anterior.n + 1, erro: e instanceof Error ? e.message : 'Erro inesperado.' };
}

export async function adicionarMembro(
  anterior: EstadoSenha,
  dados: FormData,
): Promise<EstadoSenha> {
  // Fora do try: sem permissão, `exigirAdmin` redireciona — e o
  // redirecionamento é uma exceção que não pode ser engolida aqui.
  await exigirAdmin();

  try {
    const { usuario, senha, promovido } = await criarConta(prisma, {
      nome: String(dados.get('nome') ?? ''),
      email: String(dados.get('email') ?? ''),
      papel: (String(dados.get('papel') ?? 'ADMIN') as Role) || 'ADMIN',
    });

    revalidatePath('/cadastros/comissao');
    return {
      n: anterior.n + 1,
      senha,
      nome: usuario.nome,
      email: usuario.email,
      aviso: promovido
        ? 'O cadastro já existia e foi promovido — a pessoa mantém o histórico dela.'
        : undefined,
    };
  } catch (e) {
    return comoErro(anterior, e);
  }
}

export async function gerarNovaSenha(
  anterior: EstadoSenha,
  dados: FormData,
): Promise<EstadoSenha> {
  const eu = await exigirAdmin();
  const userId = String(dados.get('userId') ?? '');

  // Redefinir a própria senha pelo painel tranca quem clicou do lado de fora:
  // a conta volta a ser provisória, o painel exige a troca na hora — pedindo a
  // senha atual — e a janela que mostraria a nova some com o redirecionamento.
  if (eu.id === userId) {
    return {
      n: anterior.n + 1,
      erro: 'Esta é a sua própria conta. Peça a outro administrador para gerar a senha nova.',
    };
  }

  try {
    const { nome, email, senha } = await redefinirSenha(prisma, userId);
    revalidatePath('/cadastros/comissao');
    return {
      n: anterior.n + 1,
      senha,
      nome,
      email,
      aviso: 'A senha anterior deixou de valer.',
    };
  } catch (e) {
    return comoErro(anterior, e);
  }
}

export async function removerMembro(userId: string): Promise<void> {
  const eu = await exigirAdmin();

  // Tirar o próprio acesso derruba quem está mexendo, no meio da operação.
  // A trava da última conta ADMIN não cobre este caso: pode haver outras.
  if (eu.id === userId) {
    throw new Error('Você não pode revogar o próprio acesso. Peça a outro administrador.');
  }

  const { destino } = await revogarAcesso(prisma, userId);
  revalidatePath('/cadastros/comissao');
  redirect(`/cadastros/comissao?ok=revogado-${destino}`);
}
