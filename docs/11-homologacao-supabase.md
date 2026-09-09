# Homologação no Supabase

Ambiente de homologação do CPA, separado do desenvolvimento local.

| | |
|---|---|
| Projeto | `insted-cpa-homologacao` |
| Referência | `matdakehdodsnnvndkth` |
| Região | `sa-east-1` (São Paulo) |
| URL | https://matdakehdodsnnvndkth.supabase.co |
| Postgres | 17.6 |
| Custo | US$ 0/mês (plano gratuito) |

## Subindo o schema

1. No painel do Supabase: **Project Settings → Database → Connection string**.
   Copie as duas — *Direct connection* (5432) e *Transaction pooler* (6543).
2. Copie `.env.homologacao.example` para `.env.homologacao` e preencha a senha.
   O arquivo real está no `.gitignore`.
3. Rode:

```bash
npm.cmd run db:homolog
```

O script usa a conexão **direta** para migrar e nunca imprime a senha — só o
host de destino, porque errar de banco em homologação é fácil e descobrir
depois é caro.

### Por que duas conexões

Migração precisa de conexão direta: o pooler de transação não mantém a sessão
entre comandos, e uma migração com vários `ALTER` falha no meio de um jeito
difícil de diagnosticar. A aplicação, que abre muitas conexões curtas, é
exatamente o caso para o qual o pooler existe — daí `?pgbouncer=true` e
`connection_limit=1` na URL de runtime.

## Depois do schema

```bash
npm.cmd run db:formularios     # blocos e questões da CPA
npm.cmd run admin -- criar --email=… --nome="…"
```

Ambos leem `DATABASE_URL` do `.env` — aponte para homologação antes de rodar,
ou vai popular o banco local sem perceber.

## O que NÃO replicar de desenvolvimento

**`SESSION_SECRET` precisa ser outro.** Reaproveitar significa que um cookie
assinado em desenvolvimento vale em homologação. Gere:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**`JACAD_TOKEN` só se for importar dados reais.** Ele dá acesso ao portal de
qualquer aluno sabendo só o RA (ver [08](08-autenticacao-jacad.md)), e a
restrição de IP do JACAD vale por IP de origem — o servidor de homologação
precisaria ser liberado à parte.

**Dados de aluno.** Homologação com os 1.780 alunos reais é homologação com
dado pessoal de 1.780 pessoas. Se for para testar volume, prefira gerar massa
sintética; se for para testar a importação de verdade, trate o ambiente com o
mesmo cuidado do de produção.

## Onde a aplicação roda

O Supabase é só o banco. O Next.js precisa de um host próprio — Vercel é o
caminho de menor atrito, com `DATABASE_URL` (pooler) e `SESSION_SECRET` nas
variáveis de ambiente do projeto.

Um detalhe que vai aparecer lá: o cofre de senha provisória da tela da comissão
vive na memória do processo. Em serverless, cada requisição pode cair numa
instância diferente, e a senha simplesmente não aparece — o contorno é clicar
em "Nova senha" até cair na mesma, o que é ruim. Antes de ir para produção
serverless, esse cofre precisa virar Redis (já está no `docker-compose`) ou uma
tabela com expiração.
