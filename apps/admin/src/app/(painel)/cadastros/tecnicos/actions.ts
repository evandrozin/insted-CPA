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
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'node:crypto';
import { prisma, criarConta, redefinirSenha, revogarAcesso } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

/**
 * Cofre de uso único para a senha recém-gerada — o mesmo mecanismo da tela da
 * comissão. A URL carrega só um id opaco; a primeira leitura destrói a entrada.
 *
 * Vive no processo: com mais de uma instância atrás de balanceador, a senha
 * não aparece e é preciso clicar em "Nova senha". Ver docs/11.
 */
type Guardado = { nome: string; email: string; senha: string; em: number };
const cofre = new Map<string, Guardado>();
const VALIDADE_MS = 5 * 60_000;

function guardar(nome: string, email: string, senha: string): string {
  const agora = Date.now();
  for (const [k, v] of cofre) if (agora - v.em > VALIDADE_MS) cofre.delete(k);
  const id = randomUUID();
  cofre.set(id, { nome, email, senha, em: agora });
  return id;
}

export async function consumirSenha(
  id: string | null,
): Promise<{ nome: string; email: string; senha: string } | null> {
  if (!id) return null;
  const item = cofre.get(id);
  cofre.delete(id);
  if (!item || Date.now() - item.em > VALIDADE_MS) return null;
  return { nome: item.nome, email: item.email, senha: item.senha };
}

export async function adicionarTecnico(dados: FormData): Promise<void> {
  // `exigirPainel`, não `exigirAdmin`: cadastrar respondente não é escalar
  // privilégio — a conta criada aqui nunca abre o painel. Coordenação também
  // precisa poder cadastrar o pessoal do próprio setor.
  await exigirPainel();

  const { usuario, senha, promovido } = await criarConta(prisma, {
    nome: String(dados.get('nome') ?? ''),
    email: String(dados.get('email') ?? ''),
    papel: 'TECNICO_ADMIN',
    matricula: String(dados.get('matricula') ?? '').trim() || undefined,
  });

  const id = guardar(usuario.nome, usuario.email, senha);
  revalidatePath('/cadastros/tecnicos');
  redirect(`/cadastros/tecnicos?ok=${promovido ? 'promovido' : 'criado'}&s=${id}`);
}

export async function novaSenhaTecnico(userId: string): Promise<void> {
  await exigirPainel();
  const { nome, email, senha } = await redefinirSenha(prisma, userId);
  const id = guardar(nome, email, senha);
  revalidatePath('/cadastros/tecnicos');
  redirect(`/cadastros/tecnicos?ok=senha&s=${id}`);
}

export async function removerTecnico(userId: string): Promise<void> {
  await exigirPainel();
  const { destino } = await revogarAcesso(prisma, userId);
  revalidatePath('/cadastros/tecnicos');
  redirect(`/cadastros/tecnicos?ok=revogado-${destino}`);
}
