'use server';

import { redirect } from 'next/navigation';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@insted/database';
import { respondenteAtual, PAPEIS_PAINEL } from '@/lib/sessao';
import { MINIMO_SENHA } from './politica';

/**
 * Troca da própria senha.
 *
 * Exige a senha atual mesmo com sessão aberta: sem isso, um navegador deixado
 * destravado numa secretaria vira acesso permanente ao painel — basta trocar a
 * senha e o dono perde a conta.
 */
export async function trocarSenha(dados: FormData): Promise<void> {
  const eu = await respondenteAtual();
  if (!eu) redirect('/entrar');

  const atual = String(dados.get('atual') ?? '');
  const nova = String(dados.get('nova') ?? '');
  const confirmacao = String(dados.get('confirmacao') ?? '');

  if (nova.length < MINIMO_SENHA) {
    throw new Error(`A senha do painel precisa ter ao menos ${MINIMO_SENHA} caracteres.`);
  }
  if (nova !== confirmacao) throw new Error('As duas senhas não coincidem.');
  if (nova === atual) throw new Error('A nova senha precisa ser diferente da atual.');

  const user = await prisma.user.findUnique({
    where: { id: eu.id },
    select: { senhaHash: true, role: true },
  });
  if (!user?.senhaHash) throw new Error('Conta sem senha definida. Procure a TI.');
  if (!(await compare(atual, user.senhaHash))) throw new Error('A senha atual não confere.');

  await prisma.user.update({
    where: { id: eu.id },
    data: { senhaHash: await hash(nova, 12), senhaProvisoria: false },
  });

  await prisma.auditLog
    .create({ data: { acao: 'SENHA_ALTERADA', entidade: 'User', entidadeId: eu.id } })
    .catch(() => {});

  redirect(PAPEIS_PAINEL.has(user.role) ? '/' : '/minhas-avaliacoes');
}
