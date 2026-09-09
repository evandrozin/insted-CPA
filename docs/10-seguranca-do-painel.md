# Segurança do painel da CPA

O painel administra importação do JACAD, formulários, ciclos e a liberação que
**apaga respostas já enviadas**. Até 09/09/2026 ele não tinha autenticação
nenhuma: qualquer requisição a `/formularios` ou `/periodos` era servida.

Este documento registra o que foi fechado e por quê.

## Duas guardas, não uma

O erro fácil aqui é proteger só a navegação. O layout de `(painel)` chama
`exigirPainel()`, e isso basta para que ninguém *veja* uma tela — mas **Server
Action é um endpoint POST com identificador próprio**, e um POST direto a ele
não passa por layout nenhum.

Então as duas coisas:

| Camada | O que protege |
|---|---|
| `(painel)/layout.tsx` | a navegação — quem não tem sessão administrativa não vê tela |
| `exigirPainel()` no início de **cada** uma das 27 ações | a execução — o POST direto morre antes de tocar o banco |

`exigirPainel` lê o papel **do banco** a cada chamada, não do cookie: revogar um
acesso passa a valer na hora, sem esperar a sessão de 12 h expirar.

Quem é respondente e cai numa rota do painel é mandado para
`/minhas-avaliacoes`, não para uma tela de "não autorizado" — o aviso só
ensinaria que existe um painel para tentar alcançar.

## Conta administrativa nasce fora da web

A tela de login tem um "primeiro acesso" que define senha conferindo matrícula
+ e-mail. Para respondente é um risco medido e aceito (ver
[08](08-autenticacao-jacad.md)). Para conta de painel seria a porta dos fundos:
**RA e e-mail institucional de um coordenador são públicos**, e qualquer pessoa
criaria a senha do painel.

`criarSenha` recusa contas ADMIN e GESTOR, e a recusa usa a mesma mensagem
genérica das outras — quem tentar não descobre que acertou o alvo. A tentativa
vira `LOGIN_FALHOU` com o motivo real na auditoria.

Conta de painel se cria pelo CLI:

```bash
npm run admin -- listar
npm run admin -- criar --email=fulano@insted.edu.br --nome="Fulano de Tal"
npm run admin -- senha --email=fulano@insted.edu.br     # nova provisória
npm run admin -- revogar --email=fulano@insted.edu.br
```

A senha provisória é gerada com `randomInt` do `node:crypto` — não
`Math.random`, que é previsível e daria o equivalente a uma senha padrão.
Aparece **uma vez**, no terminal de quem rodou o comando; o banco guarda só o
hash (bcrypt, custo 12). Entregue por um canal diferente do e-mail da conta.

`revogar` recusa tirar a última conta ADMIN ativa — do contrário ninguém entra
no painel, e voltar exige acesso ao banco.

## A provisória não vira permanente

A conta nasce com `senhaProvisoria: true`, e `exigirPainel` manda para
`/trocar-senha` antes de deixar usar qualquer tela. A troca exige a senha
atual mesmo com sessão aberta: sem isso, um navegador destravado numa
secretaria vira acesso permanente — basta trocar a senha e o dono perde a
conta.

Senha de painel: mínimo de 8 caracteres, o mesmo do respondente (decisão da CPA
em 09/09/2026; antes eram 12). O que segura a força bruta aqui é o bloqueio por
tentativas, descrito abaixo — não o comprimento. O número vive em
`apps/admin/src/app/trocar-senha/politica.ts`, lido pela validação e pelo
formulário.

## Força bruta

O painel não tem segundo fator, então uma senha cai por tentativa e erro
enquanto ninguém olha. Dez tentativas erradas para o mesmo identificador em 15
minutos bloqueiam o acesso — inclusive com a senha certa, enquanto durar.

O contador é a própria trilha de auditoria, não uma tabela nova: a informação
já estava sendo gravada, e assim o bloqueio e a investigação leem a mesma
fonte.

## O que fica registrado

`LOGIN`, `LOGIN_FALHOU` (com motivo e IP), `SENHA_ALTERADA`, `ADMIN_CRIADO`,
`ADMIN_SENHA_REDEFINIDA`, `ADMIN_REVOGADO`, além de `PORTAL_LOGIN` e
`REENVIO_LIBERADO`.

## Verificação em 09/09/2026

Testado por HTTP, replicando o caminho **sem JavaScript** — multipart para a
própria URL com o id da ação como nome de campo, que é como um atacante
chamaria a ação direto.

A prova decisiva usa a mesma requisição em três sessões diferentes, com
controle positivo (sem ele, um erro qualquer pareceria proteção):

| Sessão | Resultado de `criarCiclo` |
|---|---|
| ADMIN | **303** → `/periodos/<novo>` · ciclo **criado** |
| sem sessão | **303** → `/entrar?erro=Entre para acessar o painel da CPA.` · nada criado |
| sessão de aluno | **303** → `/minhas-avaliacoes` · nada criado |

Demais casos, todos passando:

- 5 telas do painel sem sessão → redirecionadas ao login;
- 5 telas do painel com sessão de aluno → redirecionadas a `/minhas-avaliacoes`;
- login com senha provisória → `/trocar-senha`, e o painel recusa até a troca;
- painel abre depois da troca;
- "primeiro acesso" apontado para conta de painel → recusado;
- bloqueio na 11ª tentativa errada, valendo também para a senha correta.

## O que ainda não existe

- **Segundo fator.** O bloqueio por tentativas é o que há hoje. Para uma conta
  que apaga respostas, TOTP seria o próximo passo natural.
- **Escopo do GESTOR.** Hoje ADMIN e GESTOR veem o mesmo painel. A separação
  (coordenação enxergando só o próprio curso) entra com os relatórios, na
  Fase 4.
- **Expiração por inatividade.** A sessão dura 12 h fixas.
