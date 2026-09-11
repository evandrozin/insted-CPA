'use server';

/**
 * Cadastro do corpo técnico-administrativo.
 *
 * Reaproveita as regras de `@insted/database/comissao`: a diferença entre um
 * membro da comissão e um técnico é o papel, não o rito de criação. Os dois
 * não vêm do JACAD, os dois recebem senha provisória pela mão de quem
 * cadastrou, e os dois trocam a senha no primeiro acesso.
 *
 * O que muda é o que a conta alcança: TECNICO_ADMIN não está em
 * `PAPEIS_PAINEL`, então cai em `/minhas-avaliacoes` e nunca no painel.
 *
 * A senha gerada volta no estado da resposta — ver `lib/estado-senha.ts`.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma, criarConta, redefinirSenha, revogarAcesso } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import type { EstadoSenha } from '@/lib/estado-senha';

function comoErro(anterior: EstadoSenha, e: unknown): EstadoSenha {
  return { n: anterior.n + 1, erro: e instanceof Error ? e.message : 'Erro inesperado.' };
}

export async function adicionarTecnico(
  anterior: EstadoSenha,
  dados: FormData,
): Promise<EstadoSenha> {
  // `exigirPainel`, não `exigirAdmin`: cadastrar respondente não é escalar
  // privilégio — a conta criada aqui nunca abre o painel. Coordenação também
  // precisa poder cadastrar o pessoal do próprio setor. Fora do try, porque
  // sem permissão ele redireciona, e isso não pode ser engolido.
  await exigirPainel();

  try {
    const { usuario, senha, promovido } = await criarConta(prisma, {
      nome: String(dados.get('nome') ?? ''),
      email: String(dados.get('email') ?? ''),
      papel: 'TECNICO_ADMIN',
      matricula: String(dados.get('matricula') ?? '').trim() || undefined,
    });

    revalidatePath('/cadastros/tecnicos');
    return {
      n: anterior.n + 1,
      senha,
      nome: usuario.nome,
      email: usuario.email,
      aviso: promovido
        ? 'O cadastro já existia e foi convertido — a pessoa mantém o histórico dela.'
        : undefined,
    };
  } catch (e) {
    return comoErro(anterior, e);
  }
}

export async function novaSenhaTecnico(
  anterior: EstadoSenha,
  dados: FormData,
): Promise<EstadoSenha> {
  await exigirPainel();

  try {
    const { nome, email, senha } = await redefinirSenha(prisma, String(dados.get('userId') ?? ''));
    revalidatePath('/cadastros/tecnicos');
    return { n: anterior.n + 1, senha, nome, email, aviso: 'A senha anterior deixou de valer.' };
  } catch (e) {
    return comoErro(anterior, e);
  }
}

export async function removerTecnico(userId: string): Promise<void> {
  await exigirPainel();
  const { destino } = await revogarAcesso(prisma, userId);
  revalidatePath('/cadastros/tecnicos');
  redirect(`/cadastros/tecnicos?ok=revogado-${destino}`);
}
