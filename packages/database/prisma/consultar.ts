/**
 * Consulta de leitura contra o banco apontado por DATABASE_URL.
 *
 *   npm run homolog -- consultar "select nome, status from form_templates"
 *   Get-Content consulta.sql | npm run homolog -- consultar
 *
 * Existe porque `prisma db execute` não devolve linhas: dá para rodar um UPDATE
 * em homologação, mas não para conferir o resultado. A alternativa era exportar
 * a connection string no terminal — e ela fica valendo para o comando seguinte,
 * que é exatamente o acidente que o wrapper de homologação evita.
 *
 * A consulta pode vir por argumento ou pela ENTRADA PADRÃO. O wrapper monta o
 * comando com `shell: true`, que concatena os argumentos sem escapar: uma
 * consulta com aspas — e nome de coluna em camelCase precisa delas — chega
 * mutilada do outro lado. Pela entrada padrão o texto passa intacto.
 *
 * Só leitura: qualquer coisa que não comece com SELECT ou WITH é recusada.
 * Não é uma barreira de segurança — quem roda isto já tem a credencial — é
 * para que um comando de conferência não possa escrever por engano.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const LEITURA = /^\s*(select|with)\b/i;

/**
 * Tira os comentários de linha do começo antes de conferir se é leitura.
 *
 * Uma consulta documentada — que explica o que mede — começa por `--`, e isso
 * não faz dela uma escrita. Só o INÍCIO é limpo: o que vem depois do primeiro
 * comando continua sendo avaliado como está.
 */
const semComentarioInicial = (sql: string) => sql.replace(/^(\s*--[^\n]*\n)+/, '');

/** Lê a consulta da entrada padrão, quando ela não vem por argumento. */
async function daEntrada(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const partes: Buffer[] = [];
  for await (const p of process.stdin) partes.push(p as Buffer);
  return Buffer.concat(partes).toString('utf8');
}

async function main(): Promise<void> {
  const sql = (process.argv.slice(2).join(' ').trim() || (await daEntrada())).trim();
  if (!sql) {
    throw new Error(
      [
        'Passe a consulta por argumento ou pela entrada padrão:',
        '   npm run homolog -- consultar "select nome from form_templates"',
        '   Get-Content consulta.sql | npm run homolog -- consultar',
      ].join('\n'),
    );
  }
  if (!LEITURA.test(semComentarioInicial(sql))) {
    throw new Error('Só consulta de leitura (SELECT ou WITH). Para escrever, use o comando sql.');
  }

  const linhas = (await prisma.$queryRawUnsafe(sql)) as Record<string, unknown>[];

  if (linhas.length === 0) {
    console.log('\n(nenhuma linha)\n');
    return;
  }

  // Tabela simples, alinhada pela largura do conteúdo. BigInt aparece em
  // count(*) e não sobrevive a JSON.stringify — por isso o String() cru.
  const colunas = Object.keys(linhas[0]);
  const texto = (v: unknown) => (v === null ? '' : String(v));
  const largura = colunas.map((c) =>
    Math.max(c.length, ...linhas.map((l) => texto(l[c]).length)),
  );

  const linha = (celulas: string[]) =>
    celulas.map((c, i) => c.padEnd(largura[i])).join('  ').trimEnd();

  console.log('');
  console.log(linha(colunas));
  console.log(linha(largura.map((w) => '─'.repeat(w))));
  for (const l of linhas) console.log(linha(colunas.map((c) => texto(l[c]))));
  console.log(`\n${linhas.length} linha(s)\n`);
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
