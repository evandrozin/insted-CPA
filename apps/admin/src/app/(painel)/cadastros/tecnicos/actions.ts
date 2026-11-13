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
import { familiaDeEmails, semEmail } from '@/lib/tecnicos';

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

/**
 * Edita nome, e-mail e matrícula de um técnico.
 *
 * Existe principalmente para completar quem entrou sem e-mail pela planilha:
 * ao trocar o e-mail provisório por um de verdade, a conta ativa sozinha. Só
 * mexe em conta TECNICO_ADMIN — esta tela nunca altera docente, aluno ou
 * comissão.
 *
 * Erros voltam por redirecionamento: em produção o Next troca a mensagem de
 * qualquer erro de ação por um texto genérico.
 */
export async function editarTecnico(userId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  // O tipo explícito é o que permite ao compilador entender que, depois de
  // `volta(...)`, a execução não continua.
  const volta: (qs: Record<string, string>) => never = (qs) =>
    redirect(`/cadastros/tecnicos?${new URLSearchParams(qs)}`);

  const nome = String(dados.get('nome') ?? '').replace(/\s+/g, ' ').trim();
  const email = String(dados.get('email') ?? '').trim().toLowerCase();
  const matricula = String(dados.get('matricula') ?? '').trim().slice(0, 40);

  if (nome.length < 3) volta({ erro: 'Informe o nome completo.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || semEmail(email)) {
    volta({ erro: 'Informe um e-mail válido.' });
  }
  if (!matricula) volta({ erro: 'A matrícula não pode ficar vazia.' });

  const atual = await prisma.user.findFirst({
    where: { id: userId, role: 'TECNICO_ADMIN', deletadoEm: null },
    select: { id: true, email: true, status: true },
  });
  if (!atual) volta({ erro: 'Técnico não encontrado.' });

  const familia = familiaDeEmails(email);
  const [outraMatricula, ocupados] = await Promise.all([
    prisma.user.findFirst({
      where: { id: { not: userId }, matricula },
      select: { id: true },
    }),
    prisma.user.findMany({
      where: {
        id: { not: userId },
        OR: familia.map((e) => ({ email: { equals: e, mode: 'insensitive' as const } })),
      },
      select: { email: true },
    }),
  ]);

  if (outraMatricula) volta({ erro: 'Essa matrícula já pertence a outra conta.' });

  // Os técnicos são independentes: o e-mail pode ser também de um aluno, de um
  // docente ou de outro técnico, e nada disso é motivo de recusa. O banco só
  // aceita um e-mail por conta, então este técnico fica com o primeiro endereço
  // livre da família — o próprio e-mail, ou `+tec`, `+tec2`… (ver
  // `familiaDeEmails`). Quem digita o e-mail normal em `/entrar/tecnico` o encontra.
  const usados = new Set(ocupados.map((o) => o.email.toLowerCase()));
  const emailFinal = familia.find((e) => !usados.has(e));
  if (!emailFinal) volta({ erro: 'Já existem 10 contas com este e-mail; não dá para criar outra.' });
  const comAlias = emailFinal !== email;

  // Quem estava sem e-mail passa a ter um: pronto para responder.
  const completouEmail = semEmail(atual.email);
  await prisma.user.update({
    where: { id: userId },
    data: {
      nome,
      email: emailFinal,
      matricula,
      ...(completouEmail ? { status: 'ATIVO' as const } : {}),
    },
  });
  await prisma.auditLog.create({
    data: {
      acao: 'TECNICO_EDITADO',
      entidade: 'User',
      entidadeId: userId,
      dadosDepois: { completouEmail, comAlias },
    },
  });

  revalidatePath('/cadastros/tecnicos');
  volta({ ok: comAlias ? 'editado-alias' : completouEmail ? 'ativado' : 'editado' });
}

export async function removerTecnico(userId: string): Promise<void> {
  await exigirPainel();
  const { destino } = await revogarAcesso(prisma, userId);
  revalidatePath('/cadastros/tecnicos');
  redirect(`/cadastros/tecnicos?ok=revogado-${destino}`);
}
