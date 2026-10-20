#!/bin/sh
# Sobe o painel. Antes, aplica as migrações pendentes — o que antes era
# `npm run homolog -- migrar` feito à mão contra o Supabase.
#
# RODAR_MIGRACOES=false desliga a etapa (útil para réplica extra ou para
# investigar um banco sem tocar nele). Com uma única instância, deixe ligada.
set -e

if [ "${RODAR_MIGRACOES:-true}" = "true" ]; then
  echo "→ aplicando migrações pendentes"
  ./node_modules/.bin/prisma migrate deploy --schema packages/database/prisma/schema.prisma
fi

cd apps/admin
echo "→ painel em :${PORT:-3000}"
# `exec`: o Next vira o processo principal e recebe o SIGTERM do Docker — sem
# isso, um redeploy espera o timeout e mata a conexão de quem está respondendo.
exec ../../node_modules/.bin/next start -p "${PORT:-3000}" -H 0.0.0.0
