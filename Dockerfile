# Painel da CPA (apps/admin) — imagem única, pronta para Coolify ou docker run.
#
# Debian slim, não Alpine: o Prisma traz binários nativos e o musl do Alpine é
# a fonte clássica de "funciona aqui, não funciona na imagem".
#
# O que NÃO entra: nenhum segredo. DATABASE_URL, SESSION_SECRET, JWT_ACCESS_SECRET
# e as variáveis do JACAD chegam em tempo de execução, pelo ambiente.

FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---------------------------------------------------------------- dependências
# Só os manifestos: a camada de `npm ci` fica em cache enquanto o package-lock
# não mudar, e o build deixa de baixar o mundo a cada commit.
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/admin/package.json apps/admin/
COPY packages/avaliacao/package.json packages/avaliacao/
COPY packages/database/package.json packages/database/
COPY packages/jacad/package.json packages/jacad/
# --ignore-scripts: o `postinstall` do pacote de banco roda `prisma generate`,
# que precisa do schema — ainda não copiado. Gera-se explicitamente depois.
RUN npm ci --ignore-scripts

# ----------------------------------------------------------------------- build
FROM deps AS build
COPY . .
RUN npx prisma generate --schema packages/database/prisma/schema.prisma
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build -w @insted/admin

# ------------------------------------------------------------------- execução
FROM base AS run
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER node
EXPOSE 3000

# /entrar não toca no banco: o healthcheck responde "o app está de pé", e não
# derruba o container por um Postgres que demorou a subir.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/entrar').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["docker-entrypoint.sh"]
