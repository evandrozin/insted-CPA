/**
 * Sessão do respondente.
 *
 * Cookie httpOnly assinado com HMAC-SHA256. É deliberadamente simples: a
 * arquitetura prevê JWT com refresh rotativo na API NestJS, que ainda não
 * existe. Quando ela entrar, este módulo vira o cliente dela e o formato do
 * token muda num lugar só.
 *
 * O que NÃO pode mudar quando isso acontecer: a sessão identifica quem está
 * respondendo apenas para achar as tarefas dele. Ela nunca entra no caminho
 * da gravação das respostas — o anonimato depende de a resposta não carregar
 * o respondente, e não de a sessão ser secreta.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';

const COOKIE = 'insted_sessao';
const DURACAO_H = 12;

function segredo(): string {
  const s = process.env.SESSION_SECRET ?? process.env.JWT_ACCESS_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      'SESSION_SECRET ausente ou curto demais. Defina no .env antes de abrir a avaliação.',
    );
  }
  return s;
}

/**
 * Confere que a sessão é possível ANTES de gravar qualquer coisa.
 *
 * Sem isto, `criarSenha` gravava a senha e só depois falhava ao assinar o
 * cookie: o aluno terminava com senha criada, sem estar logado e sem saber
 * qual senha ficou valendo. Falhar antes de escrever evita o estado parcial.
 */
export function garantirSessaoPossivel(): void {
  segredo();
}

function assinar(payload: string): string {
  return createHmac('sha256', segredo()).update(payload).digest('base64url');
}

/** `<userId>.<expiraEm>.<assinatura>` */
function montar(userId: string): string {
  const expira = Date.now() + DURACAO_H * 3600_000;
  const payload = `${userId}.${expira}`;
  return `${payload}.${assinar(payload)}`;
}

function conferir(token: string): string | null {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  const [userId, expiraStr, assinatura] = partes;
  const esperada = assinar(`${userId}.${expiraStr}`);

  // Comparação em tempo constante: uma comparação comum vaza, pelo tempo de
  // resposta, quantos caracteres iniciais da assinatura estavam certos.
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  if (Number(expiraStr) < Date.now()) return null;
  return userId;
}

export async function abrirSessao(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, montar(userId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_H * 3600,
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function encerrarSessao(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export type Respondente = {
  id: string;
  nome: string;
  matricula: string;
  role: string;
  /** Senha ainda é a provisória entregue pelo CLI — precisa ser trocada. */
  senhaProvisoria: boolean;
};

/** Usuário da sessão, ou null. Não redireciona — quem chama decide. */
export async function respondenteAtual(): Promise<Respondente | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  const userId = conferir(token);
  if (!userId) return null;

  const u = await prisma.user
    .findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        matricula: true,
        role: true,
        status: true,
        deletadoEm: true,
        senhaProvisoria: true,
      },
    })
    .catch(() => null);

  // Conta desativada depois do login perde o acesso na hora.
  if (!u || u.status !== 'ATIVO' || u.deletadoEm) return null;

  return {
    id: u.id,
    nome: u.nome,
    matricula: u.matricula,
    role: u.role,
    senhaProvisoria: u.senhaProvisoria,
  };
}

// ============================================================================
// AUTORIZAÇÃO DO PAINEL
// ============================================================================

/** Papéis que administram a avaliação. */
export const PAPEIS_PAINEL = new Set(['ADMIN', 'GESTOR']);

/**
 * Exige sessão administrativa. Use no layout do painel E no início de CADA
 * Server Action do painel.
 *
 * As duas coisas, não uma. A guarda do layout protege a navegação, mas Server
 * Action é um endpoint POST com identificador próprio: um POST direto a ele
 * não passa por layout nenhum. Proteger só a tela deixaria as 27 ações do
 * painel abertas a quem montasse a requisição — inclusive as que apagam
 * respostas e disparam importação.
 *
 * Lê o papel do banco a cada chamada, e não do cookie: revogar um acesso passa
 * a valer na hora, sem esperar a sessão expirar.
 */
export async function exigirPainel(): Promise<Respondente> {
  const eu = await respondenteAtual();

  if (!eu) {
    redirect('/entrar?erro=' + encodeURIComponent('Entre para acessar o painel da CPA.'));
  }

  if (!PAPEIS_PAINEL.has(eu.role)) {
    // Quem é respondente não vê "não autorizado" e sim o próprio lugar: o
    // aviso só ensinaria que existe um painel para tentar alcançar.
    redirect('/minhas-avaliacoes');
  }

  if (eu.senhaProvisoria) {
    redirect('/trocar-senha');
  }

  return eu;
}

/**
 * Exige ADMIN, não só sessão de painel.
 *
 * Gestão de contas é o único lugar onde a diferença entre ADMIN e GESTOR já
 * importa hoje: sem esta separação, um gestor se promoveria a administrador —
 * ou criaria uma conta nova para si — e o papel deixaria de significar algo.
 */
export async function exigirAdmin(): Promise<Respondente> {
  const eu = await exigirPainel();
  if (eu.role !== 'ADMIN') {
    redirect('/?erro=' + encodeURIComponent('Só um administrador gerencia contas da comissão.'));
  }
  return eu;
}
