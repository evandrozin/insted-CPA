import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as carregarDotenv } from 'dotenv';
import type { NextConfig } from 'next';

/**
 * O `.env` do projeto é o da RAIZ do monorepo, não o de `apps/admin`.
 *
 * O Next carrega apenas o `.env` do diretório da própria app, então sem isto
 * `SESSION_SECRET` e `DATABASE_URL` chegam indefinidos — e o sintoma aparece
 * tarde, na primeira ação que precisa deles.
 */
// Sobe até o primeiro `.env` encontrado — o mesmo critério de
// `packages/jacad/src/env.ts`, para que CLI e painel leiam o mesmo arquivo.
let dir = process.cwd();
for (let i = 0; i < 5; i++) {
  const candidato = join(dir, '.env');
  if (existsSync(candidato)) {
    carregarDotenv({ path: candidato });
    break;
  }
  dir = dirname(dir);
}

const config: NextConfig = {
  reactStrictMode: true,

  // Pacotes do monorepo entram como TypeScript, sem passo de build próprio.
  transpilePackages: ['@insted/database', '@insted/avaliacao', '@insted/jacad'],

  webpack: (cfg) => {
    // Os pacotes internos são ESM e importam com extensão `.js`
    // (`./gerar-alvos.js`), como exige o moduleResolution NodeNext do tsx.
    // O webpack não faz essa correspondência sozinho e falha ao resolver o
    // arquivo, que na verdade é `.ts`.
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default config;
