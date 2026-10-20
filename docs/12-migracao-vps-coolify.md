# 12 — Sair do Vercel + Supabase para uma VPS com Coolify

Roteiro para publicar o painel em Docker numa VPS (Hostinger) gerenciada pelo
Coolify, levando o banco junto. Tudo abaixo foi **ensaiado localmente**: a
imagem sobe, aplica migrações, o login funciona e o dump/restauração do banco
é conferido tabela a tabela. O que NÃO foi ensaiado é a VPS em si.

## 1. Decisões antes de começar

| Decisão | Recomendação | Por quê |
|---|---|---|
| Endereço | **Subdomínio** (`cpa.insted.edu.br`) | Pede só um registro DNS. `insted.edu.br/cpa` exige que o site principal repasse o caminho e que o app rode com `basePath`, que afeta links e formulários de todas as telas. |
| Nginx | **Não instalar** | O Coolify já usa o Traefik nas portas 80/443; um nginx na mesma VPS brigaria por elas. |
| Banco | **PostgreSQL 17** | O Supabase roda 17.x; restaurar um dump 17 num 16 não é seguro. |

## 2. Preparar a VPS

1. Ubuntu 22.04 ou 24.04 limpo (a Hostinger pode oferecer template com Coolify).
2. Instalar o Coolify (comando de uma linha da documentação oficial).
3. Firewall: liberar só **22, 80, 443** e a porta do painel do Coolify (8000).
   Atenção: o Docker publica portas **por cima do ufw**. Não confie no ufw para
   esconder uma porta de banco; use o firewall do painel da Hostinger também.
4. DNS: criar `cpa` (tipo A) apontando para o IP da VPS. Pode ser feito com
   antecedência, apontando para a VPS enquanto o Vercel segue em produção em
   outro endereço.

## 3. No Coolify

**Banco** (Resources → New → PostgreSQL 17)
- Nome do banco `insted_cpa`, usuário e senha fortes (guarde num gerenciador).
- **Sem** porta pública (só durante a restauração, ver seção 5).
- Ativar **backup agendado** para um S3/Backblaze e **testar uma restauração**.
  No Supabase o backup era feito por eles; aqui é responsabilidade sua.

**Aplicação** (Resources → New → Public/Private Repository)
- Repositório `evandrozin/insted-CPA`, branch `main`, **Build Pack: Dockerfile**.
- Porta exposta `3000`. Domínio `https://cpa.insted.edu.br` (HTTPS automático).
- Ligar o deploy automático por webhook, se quiser que `git push` publique.

**Variáveis de ambiente** (em *Runtime*, nunca no repositório)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | `postgresql://USUARIO:SENHA@HOST_INTERNO:5432/insted_cpa?schema=public` (o Coolify mostra a URL interna do recurso) |
| `SESSION_SECRET` | o mesmo do Vercel, para manter as sessões abertas, ou um novo (todos terão de entrar de novo) |
| `JWT_ACCESS_SECRET` | idem |
| `JACAD_BASE_URL`, `JACAD_TOKEN` | os mesmos do Vercel |
| `RODAR_MIGRACOES` | `true` (padrão) |

Confirme com o JACAD se a API restringe por IP; se sim, libere o IP da VPS.

## 4. Ensaio na VPS (sem tráfego real)

Suba a aplicação com o banco vazio: o contêiner aplica as migrações sozinho
(`prisma migrate deploy`) e o healthcheck em `/entrar` fica verde. Crie um admin
de teste (`npm run admin -- criar`, apontando `DATABASE_URL` para o banco da
VPS) e confirme que o login funciona em HTTPS. Depois, ensaie a seção 5 com um
dump real, **fora do horário de uso**, e apague o dump ao final.

## 5. A virada, com o ciclo aberto

O dump contém dados pessoais e respostas. Faça de um computador seu, não
versione (o `.gitignore` já barra `*.pgdump`) e apague depois de conferido.

1. **Avise** os alunos de uma janela curta, em horário de pouco uso.
2. **Congele a escrita**: pause o projeto no Vercel (ou tire o domínio do ar).
   Resposta enviada depois do dump se perde.
3. **Dump** do Supabase (use a URL do *Session pooler*, porta 5432):
   ```bash
   ORIGEM="postgresql://…" ./infra/migrar-banco.sh dump cpa.pgdump
   ```
4. **Abra o banco da VPS** só para isso: no Coolify, ative "Make it publicly
   available" no Postgres e **acesse por túnel SSH**, sem expor a porta:
   ```bash
   ssh -N -L 5440:127.0.0.1:PORTA_PUBLICADA usuario@IP_DA_VPS
   ```
5. **Restaure e confira**:
   ```bash
   DESTINO="postgresql://USUARIO:SENHA@localhost:5440/insted_cpa" \
     ./infra/migrar-banco.sh restaurar cpa.pgdump
   ORIGEM="postgresql://…" DESTINO="postgresql://USUARIO:SENHA@localhost:5440/insted_cpa" \
     ./infra/migrar-banco.sh conferir
   ```
   Só siga se aparecer `OK — 39 tabelas, todas com a mesma contagem de linhas.`
6. **Desligue** a publicação da porta do Postgres no Coolify e feche o túnel.
7. Faça o deploy (ou reinicie) a aplicação: ela deve logar
   `No pending migrations to apply`, porque o dump leva a tabela
   `_prisma_migrations` junto.
8. Aponte o DNS final, teste login, uma resposta de teste e a tela de
   Matrículas. Só então comunique que voltou.

**Plano B**: o Vercel e o Supabase ficam **intactos por alguns dias**. Se algo
falhar, volte o domínio para o Vercel; o banco de lá não foi alterado. Respostas
dadas já na VPS ficam só lá, então decida cedo: depois que alunos responderem
na VPS, voltar significa perder essas respostas.

## 6. Depois

- Confirmar que o backup agendado rodou e restaurar uma cópia num banco de teste.
- `/saude` expõe o host do banco: restrinja ou remova antes de divulgar o link.
- Remover o `vercel.json` e apagar o projeto Vercel e o Supabase só depois de
  alguns dias estáveis.
- As migrações novas passam a ser aplicadas a cada deploy; não há mais
  `npm run homolog -- migrar`.
