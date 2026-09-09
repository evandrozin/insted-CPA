/**
 * Sobe o schema para o Supabase de homologação.
 *
 *   npm.cmd run db:homolog
 *
 * Lê `.env.homologacao` da raiz e usa a conexão DIRETA (5432) para migrar. O
 * pooler de transação (6543) não serve aqui: ele não mantém a sessão entre
 * comandos, e uma migração com vários ALTER falha no meio de um jeito difícil
 * de diagnosticar. A aplicação, essa sim, usa o pooler.
 *
 * A senha nunca é impressa. O script mostra host e banco, e mais nada.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const arquivo = resolve(raiz, '.env.homologacao');

if (!existsSync(arquivo)) {
  console.error(`\n❌ Falta ${arquivo}\n`);
  console.error('   Copie .env.homologacao.example, preencha a senha do banco');
  console.error('   (Supabase → Project Settings → Database → Connection string)');
  console.error('   e rode de novo.\n');
  process.exit(1);
}

/** Lê pares CHAVE=valor sem depender de dependência externa. */
const env = {};
for (const linha of readFileSync(arquivo, 'utf8').split('\n')) {
  const m = linha.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?([^"\r\n]*)"?\s*$/);
  if (m) env[m[1]] = m[2];
}

const bruta = env.DATABASE_URL_DIRETA || env.DATABASE_URL;
if (!bruta || bruta.includes('SENHA')) {
  console.error('\n❌ DATABASE_URL_DIRETA ainda está com o placeholder SENHA.\n');
  process.exit(1);
}

/**
 * Escapa a senha dentro da URL.
 *
 * A senha gerada pelo Supabase costuma trazer `@`, `#` e outros caracteres com
 * significado numa URI: o `@` separa credencial de host, o `#` inicia
 * fragmento. Colada crua, a string faz o driver enxergar um host que não
 * existe — o erro sai como "não consegui conectar ao servidor X", que manda
 * investigar rede quando o problema é pontuação.
 *
 * A senha vai até o ÚLTIMO `@`, não o primeiro: o primeiro pode ser dela.
 */
function escaparSenha(url) {
  const i = url.indexOf('://');
  if (i < 0) return url;
  const proto = url.slice(0, i + 3);
  const resto = url.slice(i + 3);

  const fim = resto.lastIndexOf('@');
  const inicio = resto.indexOf(':');
  if (fim < 0 || inicio < 0 || inicio > fim) return url;

  const usuario = resto.slice(0, inicio);
  const senha = resto.slice(inicio + 1, fim);
  const host = resto.slice(fim + 1);

  // Já percent-encoded? Codificar de novo viraria %2540.
  if (/%[0-9A-Fa-f]{2}/.test(senha)) return url;

  return `${proto}${usuario}:${encodeURIComponent(senha)}@${host}`;
}

const direta = escaparSenha(bruta);
if (direta !== bruta) {
  console.log('→ senha percent-encoded (tinha caractere com significado em URL)');
}

// Mostra o destino sem a credencial — errar de banco em homologação é fácil,
// e descobrir depois é caro.
const alvo = direta.replace(/:\/\/([^:]+):[^@]*@/, '://$1:***@');
console.log(`\n→ migrando ${alvo}\n`);

// Roda de dentro de packages/database com caminho RELATIVO. O caminho absoluto
// contém espaço ("Insted - CPA") e, com `shell: true` no Windows, o cmd
// reparte os argumentos no espaço — o Prisma recebia "...\Insted" e reclamava
// de datasource ausente, erro que não tem nada a ver com a causa.
const cwd = resolve(raiz, 'packages/database');
const rodar = (args) =>
  execFileSync('npx', ['prisma', ...args, '--schema', 'prisma/schema.prisma'], {
    stdio: 'inherit',
    cwd,
    env: { ...process.env, DATABASE_URL: direta },
    shell: process.platform === 'win32',
  });

rodar(['migrate', 'deploy']);

console.log('\n✅ Schema aplicado.\n');
console.log('   Próximos passos:');
console.log('     1. npm.cmd run db:formularios   (cria os formulários da CPA)');
console.log('     2. npm.cmd run admin -- criar --email=… --nome="…"');
console.log('        (aponte o DATABASE_URL para homologação antes)\n');
