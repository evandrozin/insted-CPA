/**
 * Executa comandos contra o banco de HOMOLOGAÇÃO.
 *
 *   npm.cmd run homolog -- migrar
 *   npm.cmd run homolog -- formularios
 *   npm.cmd run homolog -- formularios-2026
 *   npm.cmd run homolog -- admin criar --email=fulano@insted.edu.br --nome="Fulano"
 *   npm.cmd run homolog -- admin listar
 *
 * Existe para que ninguém precise exportar `DATABASE_URL` na mão antes de
 * rodar. Aquela variável fica valendo pelo resto da sessão do terminal, e o
 * comando seguinte — um seed, um reset — vai para homologação sem avisar. Aqui
 * a conexão vive só durante o processo filho.
 *
 * Lê `.env.homologacao` da raiz do monorepo. A senha nunca é impressa: o
 * script mostra host e banco, e mais nada.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const pacote = resolve(raiz, 'packages/database');
const arquivo = resolve(raiz, '.env.homologacao');

function abortar(msg, dica) {
  console.error(`\n❌ ${msg}\n`);
  if (dica) console.error(dica + '\n');
  process.exit(1);
}

if (!existsSync(arquivo)) {
  abortar(
    `Falta ${arquivo}`,
    '   Copie .env.homologacao.example, preencha as connection strings do\n' +
      '   Supabase (Project Settings → Database) e rode de novo.',
  );
}

/** Pares CHAVE=valor, sem depender de dependência externa. */
const env = {};
for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}

/**
 * Escapa a senha dentro da URL.
 *
 * A senha gerada pelo Supabase costuma trazer `@`, `#` e outros caracteres com
 * significado numa URI: o `@` separa credencial de host, o `#` inicia
 * fragmento. Colada crua, a string faz o driver enxergar um host que não
 * existe — e o erro sai como "não consegui conectar ao servidor X", que manda
 * investigar rede quando o problema é pontuação.
 *
 * A senha vai até o ÚLTIMO `@`: o primeiro pode ser dela.
 */
function escaparSenha(url) {
  const i = url.indexOf('://');
  if (i < 0) return url;
  const proto = url.slice(0, i + 3);
  const resto = url.slice(i + 3);

  const fim = resto.lastIndexOf('@');
  const inicio = resto.indexOf(':');
  if (fim < 0 || inicio < 0 || inicio > fim) return url;

  const senha = resto.slice(inicio + 1, fim);
  // Já percent-encoded? Codificar de novo viraria %2540.
  if (/%[0-9A-Fa-f]{2}/.test(senha)) return url;

  return `${proto}${resto.slice(0, inicio)}:${encodeURIComponent(senha)}@${resto.slice(fim + 1)}`;
}

const [comando, ...resto] = process.argv.slice(2);

/**
 * Migração usa a conexão de sessão (5432); o resto pode usar qualquer uma.
 *
 * O pooler de transação não mantém a sessão entre comandos, e uma migração com
 * vários ALTER falha no meio. Já o host da conexão *direta* do Supabase
 * (`db.<ref>.supabase.co`) resolve só em IPv6 — daí `DATABASE_URL_DIRETA`
 * apontar para o session pooler, e não para ele.
 */
const url = escaparSenha(
  (comando === 'migrar' ? env.DATABASE_URL_DIRETA : env.DATABASE_URL_DIRETA || env.DATABASE_URL) ??
    '',
);

if (!url || url.includes('SENHA')) {
  abortar('DATABASE_URL_DIRETA ausente ou ainda com o placeholder SENHA.');
}

const destino = url.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');

const rodar = (args) =>
  execFileSync('npx', args, {
    stdio: 'inherit',
    cwd: pacote,
    // Caminho relativo e cwd no pacote: o caminho absoluto tem espaço
    // ("Insted - CPA") e, com shell no Windows, o cmd reparte os argumentos ali.
    env: { ...process.env, DATABASE_URL: url },
    shell: process.platform === 'win32',
  });

console.log(`\n→ homologação: ${destino}\n`);

switch (comando) {
  case 'migrar':
    rodar(['prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
    console.log('\n✅ Schema aplicado.\n');
    break;

  case 'formularios':
    rodar(['tsx', 'prisma/formularios-2025.ts']);
    break;

  case 'formularios-2026':
    rodar(['tsx', 'prisma/formularios-2026.ts']);
    break;

  case 'admin':
    rodar(['tsx', 'prisma/admin.ts', ...resto]);
    break;

  case 'sql':
    rodar(['prisma', 'db', 'execute', '--stdin', '--schema', 'prisma/schema.prisma']);
    break;

  default:
    console.log(`Comandos contra o banco de homologação:

  npm.cmd run homolog -- migrar
  npm.cmd run homolog -- formularios
 *   npm.cmd run homolog -- formularios-2026
  npm.cmd run homolog -- admin listar
  npm.cmd run homolog -- admin criar --email=<e-mail> --nome="<nome>"
  npm.cmd run homolog -- admin senha --email=<e-mail>

A conexão vale só para o comando — não fica valendo no terminal depois.`);
    process.exitCode = 1;
}
