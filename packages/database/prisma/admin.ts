/**
 * Contas de painel, pela linha de comando.
 *
 *   npm run admin -- listar
 *   npm run admin -- criar --email=fulano@insted.edu.br --nome="Fulano de Tal"
 *   npm run admin -- criar --email=… --nome="…" --papel=GESTOR
 *   npm run admin -- senha --email=…             gera nova provisória
 *   npm run admin -- revogar --email=…
 *
 * Este comando existe para o problema do ovo e da galinha: a primeira conta
 * precisa nascer quando ainda não há ninguém para autenticar. Depois dela, a
 * comissão se administra pela tela — Cadastros → Comissão — e não precisa mais
 * de terminal.
 *
 * As regras (senha, promoção de cadastro existente, revogação) vivem em
 * `src/comissao.ts`, compartilhadas com o painel. Aqui só tem a casca de CLI.
 */
import { PrismaClient, type Role } from '@prisma/client';
import {
  PAPEIS_PAINEL as PAPEIS,
  criarConta,
  matriculaInterna,
  redefinirSenha,
  revogarAcesso,
} from '../src/comissao.js';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

function opcoes(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) o[m[1]] = m[2];
  }
  return o;
}

function exigir(o: Record<string, string>, chave: string): string {
  const v = (o[chave] ?? '').trim();
  if (!v) throw new Error(`Informe --${chave}=…`);
  return v;
}

function mostrarSenha(email: string, senha: string): void {
  log();
  log('  ┌─────────────────────────────────────────────┐');
  log('  │  SENHA PROVISÓRIA — anote agora             │');
  log('  ├─────────────────────────────────────────────┤');
  log(`  │  ${email.padEnd(43).slice(0, 43)}│`);
  log(`  │  ${senha.padEnd(43)}│`);
  log('  └─────────────────────────────────────────────┘');
  log();
  log('  Ela não será mostrada de novo — só o hash foi gravado.');
  log('  Entregue por um canal que não seja o mesmo do e-mail da conta,');
  log('  e o painel vai exigir a troca no primeiro acesso.');
  log();
}

async function criar(o: Record<string, string>): Promise<void> {
  const email = exigir(o, 'email').toLowerCase();
  const { usuario, senha, promovido } = await criarConta(prisma, {
    email,
    nome: exigir(o, 'nome'),
    papel: (o.papel ?? 'ADMIN').toUpperCase() as Role,
    matricula: o.matricula,
  });

  if (promovido) {
    log(`\n✅ ${usuario.nome} agora é ${usuario.role} (cadastro que já existia foi promovido).`);
  } else {
    log(`\n✅ ${usuario.nome} criado como ${usuario.role}.`);
    log(`   matrícula interna: ${matriculaInterna(email)} (o login funciona pelo e-mail)`);
  }
  mostrarSenha(usuario.email, senha);
}

/** Traduz e-mail em id — o CLI fala por e-mail, as regras falam por id. */
async function idPorEmail(email: string): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { email: email.toLowerCase(), deletadoEm: null },
    select: { id: true },
  });
  if (!user) throw new Error(`Nenhuma conta ativa com o e-mail ${email}.`);
  return user.id;
}

async function novaSenha(o: Record<string, string>): Promise<void> {
  const email = exigir(o, 'email');
  const r = await redefinirSenha(prisma, await idPorEmail(email));
  log(`\n✅ Nova senha provisória para ${r.nome}.`);
  mostrarSenha(r.email, r.senha);
}

async function revogar(o: Record<string, string>): Promise<void> {
  const email = exigir(o, 'email');
  const r = await revogarAcesso(prisma, await idPorEmail(email));
  log(`\n✅ Acesso ao painel de ${r.nome} revogado.`);
  log(
    r.destino === 'respondente'
      ? '   A pessoa continua no sistema como respondente, com a tarefa dela intacta.'
      : '   A conta só existia para administrar, e foi desativada.',
  );
}

async function listar(): Promise<void> {
  const contas = await prisma.user.findMany({
    where: { role: { in: PAPEIS }, deletadoEm: null },
    orderBy: [{ role: 'asc' }, { nome: 'asc' }],
    select: {
      nome: true,
      email: true,
      role: true,
      status: true,
      senhaProvisoria: true,
      ultimoAcesso: true,
    },
  });

  if (contas.length === 0) {
    log('\n⚠  Nenhuma conta de painel. Ninguém consegue administrar a avaliação.');
    log('   npm run admin -- criar --email=… --nome="…"\n');
    return;
  }

  log('\n  papel    situação    último acesso   conta');
  log('  ───────  ──────────  ──────────────  ─────────────────────────────');
  for (const c of contas) {
    const acesso = c.ultimoAcesso ? c.ultimoAcesso.toLocaleDateString('pt-BR') : 'nunca entrou';
    const situacao = c.status !== 'ATIVO' ? c.status : c.senhaProvisoria ? 'provisória' : 'ok';
    log(
      `  ${c.role.padEnd(7)}  ${situacao.padEnd(10)}  ${acesso.padEnd(14)}  ${c.nome} <${c.email}>`,
    );
  }
  log();
}

async function main(): Promise<void> {
  const [comando, ...resto] = process.argv.slice(2);
  const o = opcoes(resto);

  switch (comando) {
    case 'criar':
      return criar(o);
    case 'senha':
      return novaSenha(o);
    case 'revogar':
      return revogar(o);
    case 'listar':
      return listar();
    default:
      log(`Contas de painel da CPA:

  npm run admin -- listar
  npm run admin -- criar --email=<e-mail> --nome="<nome>" [--papel=ADMIN|GESTOR]
  npm run admin -- senha --email=<e-mail>       gera nova senha provisória
  npm run admin -- revogar --email=<e-mail>     tira o acesso ao painel

ADMIN administra tudo, inclusive as contas da comissão. GESTOR usa o painel mas
não gerencia contas, e passa a ver só o próprio escopo quando os relatórios
entrarem (Fase 4).

Depois da primeira conta, o caminho normal é a tela: Cadastros → Comissão.
A senha aparece uma única vez, no terminal de quem roda o comando.`);
      process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
