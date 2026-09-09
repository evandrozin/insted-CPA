/**
 * Contas de painel — a comissão da CPA.
 *
 * Fica aqui, no pacote do banco, porque duas frentes precisam exatamente das
 * mesmas regras: o CLI (`npm run admin`), que cria a primeira conta quando
 * ainda não existe ninguém para autenticar, e a tela do painel, que a comissão
 * usa para cadastrar os demais membros. Regra duplicada em dois lugares é
 * regra que diverge.
 *
 * Membro da comissão NÃO é aluno nem professor. Costuma não existir no JACAD,
 * e a conta dele não tem vínculo com matrícula, turma ou disciplina — só
 * ocupa a tabela `users` porque é lá que mora a autenticação.
 */
import type { PrismaClient, Role, User } from '@prisma/client';
import { randomInt } from 'node:crypto';
import { hash } from 'bcryptjs';

/** Papéis que administram a avaliação. */
export const PAPEIS_PAINEL: Role[] = ['ADMIN', 'GESTOR'];

/** Custo do bcrypt para conta de painel. Mais alto que o do respondente. */
const CUSTO = 12;

/**
 * Senha provisória legível: quatro blocos de quatro, sem os caracteres que se
 * confundem (0/O, 1/l/I). Ela vai ser lida em voz alta ou copiada à mão, e uma
 * senha ilegível volta como chamado de suporte — ou, pior, anotada num papel
 * colado no monitor.
 *
 * `randomInt` do node:crypto, não `Math.random`: senha inicial previsível é o
 * mesmo que senha padrão.
 */
export function senhaProvisoria(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bloco = () =>
    Array.from({ length: 4 }, () => alfabeto[randomInt(alfabeto.length)]).join('');
  return [bloco(), bloco(), bloco(), bloco()].join('-');
}

/**
 * Matrícula interna para quem não tem RA.
 *
 * `users.matricula` é obrigatória e única porque nasceu para o registro
 * acadêmico. Membro da comissão não tem um, então recebe um identificador
 * próprio, prefixado — o login é sempre pelo e-mail, e ninguém precisa saber
 * que este campo existe.
 */
export function matriculaInterna(email: string): string {
  return `cpa-${email.split('@')[0].replace(/[^a-z0-9._-]/gi, '')}`.slice(0, 40);
}

export type ResultadoCriacao = {
  usuario: Pick<User, 'id' | 'nome' | 'email' | 'role'>;
  senha: string;
  /** true quando havia cadastro anterior (docente importado, por exemplo). */
  promovido: boolean;
};

/**
 * Cria — ou promove — uma conta de painel e devolve a senha provisória.
 *
 * A senha volta em texto UMA vez, para quem chamou mostrar e esquecer. No banco
 * entra só o hash.
 */
export async function criarConta(
  prisma: PrismaClient,
  entrada: { email: string; nome: string; papel?: Role; matricula?: string },
): Promise<ResultadoCriacao> {
  const email = entrada.email.trim().toLowerCase();
  const nome = entrada.nome.trim();
  const papel = (entrada.papel ?? 'ADMIN') as Role;

  if (!email.includes('@')) throw new Error('Informe um e-mail válido.');
  if (nome.length < 3) throw new Error('Informe o nome completo.');
  if (!PAPEIS_PAINEL.includes(papel)) {
    throw new Error(`O papel deve ser ${PAPEIS_PAINEL.join(' ou ')}.`);
  }

  const matricula = (entrada.matricula?.trim() || matriculaInterna(email)).slice(0, 40);

  const existente = await prisma.user.findFirst({
    where: { OR: [{ email }, { matricula }] },
    select: { id: true, email: true, role: true },
  });

  const senha = senhaProvisoria();
  const comuns = {
    nome,
    role: papel,
    status: 'ATIVO' as const,
    senhaHash: await hash(senha, CUSTO),
    senhaProvisoria: true,
    deletadoEm: null,
  };

  // Promover quem já existe cobre o caso do docente que também integra a
  // comissão: ele já veio do JACAD, e criar um segundo cadastro deixaria a
  // pessoa com dois acessos e uma avaliação órfã.
  const usuario = existente
    ? await prisma.user.update({
        where: { id: existente.id },
        data: comuns,
        select: { id: true, nome: true, email: true, role: true },
      })
    : await prisma.user.create({
        // Só na criação: promover um cadastro que veio do JACAD não muda a
        // origem dele, e marcar o contrário faria a coluna mentir.
        data: { ...comuns, email, matricula, criadoManualmente: true },
        select: { id: true, nome: true, email: true, role: true },
      });

  await prisma.auditLog.create({
    data: {
      acao: 'ADMIN_CRIADO',
      entidade: 'User',
      entidadeId: usuario.id,
      dadosDepois: { email, papel, promovido: Boolean(existente) },
    },
  });

  return { usuario, senha, promovido: Boolean(existente) };
}

/** Gera nova senha provisória para uma conta de painel existente. */
export async function redefinirSenha(
  prisma: PrismaClient,
  userId: string,
): Promise<{ nome: string; email: string; senha: string }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletadoEm: null },
    select: { id: true, nome: true, email: true, role: true },
  });
  if (!user) throw new Error('Conta não encontrada.');
  if (!PAPEIS_PAINEL.includes(user.role)) {
    throw new Error(`${user.nome} não é conta de painel.`);
  }

  const senha = senhaProvisoria();
  await prisma.user.update({
    where: { id: user.id },
    data: { senhaHash: await hash(senha, CUSTO), senhaProvisoria: true },
  });
  await prisma.auditLog.create({
    data: { acao: 'ADMIN_SENHA_REDEFINIDA', entidade: 'User', entidadeId: user.id },
  });

  return { nome: user.nome, email: user.email, senha };
}

/**
 * Tira o acesso ao painel.
 *
 * O destino depende do que a pessoa é fora da comissão, e a diferença importa:
 *
 * - quem também responde a avaliação (docente, aluno) volta ao papel de
 *   respondente e continua com a tarefa dele intacta — apagar levaria a tarefa
 *   junto;
 * - quem só existia para administrar não tem para onde voltar, e o cadastro é
 *   desativado.
 *
 * Recusa tirar a última conta ADMIN ativa: sem ela ninguém entra no painel, e
 * voltar exigiria acesso direto ao banco.
 */
export async function revogarAcesso(
  prisma: PrismaClient,
  userId: string,
): Promise<{ nome: string; destino: 'respondente' | 'desativado' }> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletadoEm: null },
    select: {
      id: true,
      nome: true,
      role: true,
      _count: { select: { matriculas: true, alocacoesDocente: true, tarefas: true } },
    },
  });
  if (!user) throw new Error('Conta não encontrada.');
  if (!PAPEIS_PAINEL.includes(user.role)) {
    throw new Error(`${user.nome} não é conta de painel.`);
  }

  if (user.role === 'ADMIN') {
    const outros = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ATIVO', deletadoEm: null, id: { not: user.id } },
    });
    if (outros === 0) {
      throw new Error(
        'Esta é a última conta de administrador ativa. Crie outra antes de revogar — sem ela, ninguém entra no painel.',
      );
    }
  }

  const ehRespondente =
    user._count.matriculas > 0 || user._count.alocacoesDocente > 0 || user._count.tarefas > 0;

  await prisma.user.update({
    where: { id: user.id },
    data: ehRespondente
      ? { role: user._count.alocacoesDocente > 0 ? 'PROFESSOR' : 'ALUNO', senhaProvisoria: false }
      : { status: 'INATIVO', deletadoEm: new Date() },
  });

  await prisma.auditLog.create({
    data: {
      acao: 'ADMIN_REVOGADO',
      entidade: 'User',
      entidadeId: user.id,
      dadosAntes: { papel: user.role },
      dadosDepois: { destino: ehRespondente ? 'respondente' : 'desativado' },
    },
  });

  return { nome: user.nome, destino: ehRespondente ? 'respondente' : 'desativado' };
}
