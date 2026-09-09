'use server';

/**
 * Gestão das contas da comissão.
 *
 * As regras vivem em `@insted/database` (comissao.ts), compartilhadas com o
 * CLI: o CLI existe para a primeira conta, quando ainda não há ninguém para
 * autenticar; daqui em diante a comissão se administra sozinha, sem terminal.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma, criarConta, redefinirSenha, revogarAcesso } from '@insted/database';
import type { Role } from '@insted/database';
import { exigirAdmin } from '@/lib/sessao';

/**
 * Cofre de uso único para a senha recém-gerada.
 *
 * A senha precisa atravessar um redirecionamento para ser mostrada, e nenhum
 * dos caminhos óbvios serve: na query string ela fica no histórico do navegador
 * e no log de qualquer proxy; numa tabela vira senha em claro no banco; num
 * cookie, ela sobrevive a cada recarga — `cookies().delete()` não tem efeito
 * durante a renderização de um Server Component, então "mostrar uma vez" seria
 * mentira (e foi, na primeira versão desta tela).
 *
 * Aqui a URL carrega só um id opaco. A primeira leitura remove a entrada, e
 * recarregar a página não mostra mais nada.
 *
 * Vive no processo: um segundo servidor atrás de balanceador não enxerga o
 * cofre do primeiro, e a senha simplesmente não aparece. Quando o CPA for para
 * mais de uma instância, isto vira Redis — que já está no docker-compose.
 */
type Guardado = { nome: string; email: string; senha: string; em: number };
const cofre = new Map<string, Guardado>();
const VALIDADE_MS = 5 * 60_000;

function guardar(nome: string, email: string, senha: string): string {
  // Varredura preguiçosa: sem isto, uma senha que nunca foi lida ficaria em
  // memória até o processo reiniciar.
  const agora = Date.now();
  for (const [k, v] of cofre) if (agora - v.em > VALIDADE_MS) cofre.delete(k);

  const id = randomUUID();
  cofre.set(id, { nome, email, senha, em: agora });
  return id;
}

/** Lê e destrói. Chamado pela página; depois disso a senha não existe mais. */
export async function consumirSenha(
  id: string | null,
): Promise<{ nome: string; email: string; senha: string } | null> {
  if (!id) return null;
  const item = cofre.get(id);
  cofre.delete(id);
  if (!item || Date.now() - item.em > VALIDADE_MS) return null;
  return { nome: item.nome, email: item.email, senha: item.senha };
}

export async function adicionarMembro(dados: FormData): Promise<void> {
  await exigirAdmin();

  const { usuario, senha, promovido } = await criarConta(prisma, {
    nome: String(dados.get('nome') ?? ''),
    email: String(dados.get('email') ?? ''),
    papel: (String(dados.get('papel') ?? 'ADMIN') as Role) || 'ADMIN',
  });

  const id = guardar(usuario.nome, usuario.email, senha);
  revalidatePath('/cadastros/comissao');
  redirect(`/cadastros/comissao?ok=${promovido ? 'promovido' : 'criado'}&s=${id}`);
}

export async function gerarNovaSenha(userId: string): Promise<void> {
  await exigirAdmin();
  const { nome, email, senha } = await redefinirSenha(prisma, userId);
  const id = guardar(nome, email, senha);
  revalidatePath('/cadastros/comissao');
  redirect(`/cadastros/comissao?ok=senha&s=${id}`);
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
