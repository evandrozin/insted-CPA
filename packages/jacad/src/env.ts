/**
 * Carrega o .env da RAIZ do monorepo. Importe este módulo ANTES de qualquer
 * outro que leia variáveis de ambiente (`@prisma/client`, o cliente JACAD).
 *
 * `dotenv/config` sozinho não serve: o npm workspace executa os scripts com
 * cwd em packages/jacad, então o dotenv procuraria o .env no lugar errado e o
 * comando falharia dizendo que o token não existe — mesmo com o token no lugar
 * certo. Subimos a árvore até encontrar, e complementamos com o .env do pacote
 * de banco quando o DATABASE_URL mora só lá.
 */
import { config as carregarDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let raizMonorepo = dirname(fileURLToPath(import.meta.url));

for (let i = 0; i < 6; i++) {
  const candidato = join(raizMonorepo, '.env');
  if (existsSync(candidato)) {
    carregarDotenv({ path: candidato });
    break;
  }
  raizMonorepo = dirname(raizMonorepo);
}

if (!process.env.DATABASE_URL) {
  const doBanco = join(raizMonorepo, 'packages', 'database', '.env');
  if (existsSync(doBanco)) carregarDotenv({ path: doBanco });
}

export const raiz = raizMonorepo;
