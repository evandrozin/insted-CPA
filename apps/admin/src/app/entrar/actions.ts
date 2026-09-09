'use server';

/**
 * Entrada no sistema.
 *
 * Duas populações muito diferentes passam por aqui, e o que é aceitável para
 * uma não é para a outra.
 *
 * **Respondentes** vieram do JACAD sem senha (`senhaHash` vazio). O primeiro
 * acesso define a senha conferindo o e-mail do cadastro, em vez de exigir que
 * a secretaria distribua 1.814 senhas provisórias — que é o caminho mais curto
 * para senha anotada em papel. O risco é conhecido e aceito: quem souber o RA
 * e o e-mail de um colega e chegar primeiro cria a senha dele.
 *
 * **Administradores** não podem passar por esse caminho de jeito nenhum. RA e
 * e-mail institucional de um coordenador são públicos; se o primeiro acesso
 * valesse para eles, qualquer pessoa criaria a senha do painel e teria acesso
 * a importação, formulários e à liberação que apaga respostas. Conta
 * administrativa nasce pelo CLI, com senha provisória entregue fora da web:
 *
 *     npm run admin -- criar --email=… --nome="…"
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { compare, hash } from 'bcryptjs';
import { prisma } from '@insted/database';
import {
  abrirSessao,
  encerrarSessao,
  garantirSessaoPossivel,
  PAPEIS_PAINEL,
} from '@/lib/sessao';

/** Tentativas erradas toleradas por identificador antes do bloqueio. */
const LIMITE_TENTATIVAS = 10;
const JANELA_MIN = 15;

async function ip(): Promise<string | null> {
  const h = await headers();
  const encaminhado = h.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim().slice(0, 60);
  return h.get('x-real-ip')?.slice(0, 60) ?? null;
}

/**
 * Bloqueia depois de muitas tentativas erradas seguidas para o mesmo
 * identificador.
 *
 * Sem isto, uma senha de oito caracteres cai por força bruta enquanto ninguém
 * olha — e o painel não tem segundo fator. Usa a própria trilha de auditoria
 * em vez de um contador novo: a informação já estava sendo gravada, e assim o
 * bloqueio e a investigação leem a mesma fonte.
 */
async function conferirTentativas(identificador: string): Promise<void> {
  const desde = new Date(Date.now() - JANELA_MIN * 60_000);
  const erradas = await prisma.auditLog.count({
    where: {
      acao: 'LOGIN_FALHOU',
      criadoEm: { gte: desde },
      dadosDepois: { path: ['identificador'], equals: identificador },
    },
  });

  if (erradas >= LIMITE_TENTATIVAS) {
    throw new Error(
      `Muitas tentativas para este acesso. Espere ${JANELA_MIN} minutos e tente de novo.`,
    );
  }
}

async function registrarFalha(identificador: string, motivo: string): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        acao: 'LOGIN_FALHOU',
        entidade: 'Auth',
        ip: await ip(),
        dadosDepois: { identificador: identificador.slice(0, 120), motivo },
      },
    })
    .catch(() => {});
}

export async function entrar(dados: FormData): Promise<void> {
  garantirSessaoPossivel();
  const identificador = String(dados.get('matricula') ?? '').trim();
  const senha = String(dados.get('senha') ?? '');

  if (!identificador || !senha) throw new Error('Informe a matrícula e a senha.');

  await conferirTentativas(identificador);

  // Matrícula ou e-mail: quem administra pensa no próprio e-mail, não numa
  // matrícula que só existe porque o modelo exige uma.
  const user = await prisma.user.findFirst({
    where: {
      deletadoEm: null,
      OR: [{ matricula: identificador }, { email: identificador.toLowerCase() }],
    },
    select: {
      id: true,
      senhaHash: true,
      status: true,
      role: true,
      senhaProvisoria: true,
    },
  });

  // Mensagem única para usuário inexistente e senha errada: distinguir os dois
  // permite descobrir quais matrículas existem.
  const generico = 'Matrícula ou senha incorreta.';
  if (!user) {
    await registrarFalha(identificador, 'inexistente');
    throw new Error(generico);
  }

  if (user.status !== 'ATIVO') {
    await registrarFalha(identificador, 'inativo');
    throw new Error(
      'Este acesso está inativo. Procure a secretaria — pode faltar o e-mail institucional no seu cadastro.',
    );
  }

  if (!user.senhaHash) {
    if (PAPEIS_PAINEL.has(user.role)) {
      await registrarFalha(identificador, 'admin sem senha');
      throw new Error('Esta conta ainda não tem senha. Procure a TI.');
    }
    throw new Error('Primeiro acesso: use a opção "Criar minha senha" abaixo.');
  }

  if (!(await compare(senha, user.senhaHash))) {
    await registrarFalha(identificador, 'senha incorreta');
    throw new Error(generico);
  }

  await prisma.user.update({ where: { id: user.id }, data: { ultimoAcesso: new Date() } });
  await prisma.auditLog
    .create({
      data: { acao: 'LOGIN', entidade: 'User', entidadeId: user.id, ip: await ip() },
    })
    .catch(() => {});

  await abrirSessao(user.id);

  if (user.senhaProvisoria) redirect('/trocar-senha');
  redirect(PAPEIS_PAINEL.has(user.role) ? '/' : '/minhas-avaliacoes');
}

/** Primeiro acesso do respondente: confere o e-mail cadastrado e define a senha. */
export async function criarSenha(dados: FormData): Promise<void> {
  // Antes de qualquer escrita: se a sessão não puder ser aberta, não grava senha.
  garantirSessaoPossivel();

  const matricula = String(dados.get('matricula') ?? '').trim();
  const email = String(dados.get('email') ?? '').trim().toLowerCase();
  const senha = String(dados.get('senha') ?? '');
  const confirmacao = String(dados.get('confirmacao') ?? '');

  if (senha.length < 8) throw new Error('A senha precisa ter ao menos 8 caracteres.');
  if (senha !== confirmacao) throw new Error('As duas senhas não coincidem.');

  await conferirTentativas(matricula);

  const user = await prisma.user.findUnique({
    where: { matricula },
    select: { id: true, email: true, senhaHash: true, status: true, deletadoEm: true, role: true },
  });

  const generico = 'Matrícula e e-mail não conferem com o cadastro.';
  if (!user || user.deletadoEm) {
    await registrarFalha(matricula, 'primeiro acesso: inexistente');
    throw new Error(generico);
  }

  // A trava que faz este caminho ser aceitável. Ver o cabeçalho do arquivo:
  // para respondente é um risco medido; para quem administra seria entregar o
  // painel a quem lê um organograma.
  if (PAPEIS_PAINEL.has(user.role)) {
    await registrarFalha(matricula, 'primeiro acesso em conta administrativa');
    throw new Error(generico);
  }

  if (user.email.toLowerCase() !== email) {
    await registrarFalha(matricula, 'primeiro acesso: e-mail não confere');
    throw new Error(generico);
  }

  if (user.email.endsWith('@sem-email.insted.local')) {
    throw new Error(
      'Seu cadastro está sem e-mail. Procure a secretaria para regularizar antes de acessar.',
    );
  }

  if (user.senhaHash) {
    throw new Error('Esta matrícula já tem senha. Use o formulário de entrada.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { senhaHash: await hash(senha, 10), senhaProvisoria: false, ultimoAcesso: new Date() },
  });

  await abrirSessao(user.id);
  redirect('/minhas-avaliacoes');
}

export async function sair(): Promise<void> {
  await encerrarSessao();
  redirect('/entrar');
}
