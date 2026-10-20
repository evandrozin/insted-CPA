#!/usr/bin/env bash
# Leva o banco do Supabase para o Postgres da VPS — e prova que chegou inteiro.
#
#   ORIGEM="postgresql://…supabase…:5432/postgres" ./infra/migrar-banco.sh dump  cpa.pgdump
#   DESTINO="postgresql://…@localhost:5432/insted_cpa" ./infra/migrar-banco.sh restaurar cpa.pgdump
#   ORIGEM=… DESTINO=… ./infra/migrar-banco.sh conferir
#
# Usa o cliente do Postgres 17 em Docker: o Supabase roda 17.x, e um pg_dump
# MAIS ANTIGO que o servidor se recusa a rodar. Nada precisa estar instalado.
#
# CUIDADO — o arquivo de dump contém TUDO: nome e e-mail de alunos e docentes,
# respostas, comentários. Não versione (o .gitignore já barra *.pgdump), não
# mande por e-mail ou chat, e apague quando a migração for conferida.
set -euo pipefail

CLIENTE="postgres:17-alpine"
# Em Docker no Windows/Mac, "localhost" dentro do contêiner é o próprio contêiner.
# host.docker.internal aponta para a máquina que roda o Docker.
em_docker() { echo "${1//@localhost/@host.docker.internal}" | sed 's#@127\.0\.0\.1#@host.docker.internal#'; }

cmd="${1:-}"
arq="${2:-}"

case "$cmd" in
  dump)
    : "${ORIGEM:?defina ORIGEM com a URL do banco de origem}"
    : "${arq:?informe o arquivo de saída}"
    # Só o schema public: o resto do Supabase (auth, storage, vault…) não é do app.
    # --no-owner/--no-privileges: os papéis do Supabase não existem no destino.
    docker run --rm "$CLIENTE" pg_dump "$(em_docker "$ORIGEM")" \
      --format=custom --schema=public --no-owner --no-privileges > "$arq"
    echo "dump gravado em $arq ($(du -h "$arq" | cut -f1))"
    ;;

  restaurar)
    : "${DESTINO:?defina DESTINO com a URL do banco de destino}"
    : "${arq:?informe o arquivo de dump}"
    # --clean --if-exists: reexecutar o ensaio não falha por "já existe".
    # O dump leva a tabela _prisma_migrations junto, então o `migrate deploy`
    # do app, ao subir, enxerga tudo como já aplicado.
    docker run --rm -i "$CLIENTE" pg_restore --dbname "$(em_docker "$DESTINO")" \
      --no-owner --no-privileges --clean --if-exists --exit-on-error < "$arq"
    echo "restauração concluída"
    ;;

  conferir)
    : "${ORIGEM:?defina ORIGEM}"; : "${DESTINO:?defina DESTINO}"
    # Uma consulta por banco com a contagem de TODAS as tabelas do schema public.
    SQL="select string_agg(format('select %L as t, count(*) as n from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'"
    contar() {
      local url q
      url="$(em_docker "$1")"
      q="$(docker run --rm "$CLIENTE" psql "$url" -At -c "$SQL")"
      docker run --rm "$CLIENTE" psql "$url" -At -F '|' -c "select t||'|'||n from ($q) x order by t"
    }
    a="$(contar "$ORIGEM")"; b="$(contar "$DESTINO")"
    if [ "$a" = "$b" ]; then
      echo "OK — $(echo "$a" | wc -l | tr -d ' ') tabelas, todas com a mesma contagem de linhas."
    else
      echo "DIFERENÇA entre origem (<) e destino (>):"
      diff <(echo "$a") <(echo "$b") || true
      exit 1
    fi
    ;;

  *)
    sed -n '2,12p' "$0"; exit 2 ;;
esac
