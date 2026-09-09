# Autenticação: o aluno pode usar a senha do JACAD?

**Sim — e já funciona.** O aluno se autentica no portal do JACAD com a senha que
já tem, chega ao CPA com um token de acesso, e o CPA descobre quem ele é sem
pedir senha nenhuma. O fluxo foi testado ponta a ponta em 08/09/2026 com um RA
real (ver "Estado verificado", abaixo).

Falta um pedaço, e ele é do lado do JACAD: o construtor de links do portal
**não tem tag de token** — só `<ra>`, `<cpf>`, `<email>` e afins, e a única
transformação é Base 64. Sem token, não há o que validar.

Por isso a entrada de hoje é `/entrar/portal`, com o RA codificado, e ela
**não autentica** — é uma conveniência com risco aceito por decisão da CPA.
A seção "O que o portal realmente oferece" explica o que isso custa.

Um aviso que vale antes de qualquer coisa: o endpoint chamado "login remoto"
(`login/aluno`) **não valida senha** — faz o contrário do que parece. Ele serve
para mandar aluno ao portal, não para trazer aluno de lá. Usá-lo como login
seria autenticar quem soubesse um RA alheio. A seção "O que NÃO fazer" detalha.

## Como a resposta foi obtida

A API do JACAD publica a própria documentação OpenAPI, acessível com o token de
integração:

```
/swagger-ui/index.html            → interface
/api-docs.json/swagger-config     → lista os grupos
/api-docs.json/<grupo>            → especificação de cada grupo
```

As especificações estão salvas em [`docs/jacad-api/`](jacad-api/) — 133
operações em seis grupos. Consultá-las é mais rápido e confiável que sondar
endpoints por tentativa.

> Achado colateral: a documentação estava lá o tempo todo. Antes de investigar
> qualquer coisa nesta API, comece por `/api-docs.json/swagger-config`.

## O que existe

Grupo **auth** (5 operações):

| Operação | O que faz |
|---|---|
| `POST /api/v1/auth/token` | autentica o **sistema** integrador (o que já usamos) |
| `POST /api/v1/auth/login/aluno` | "login remoto" — ver abaixo |
| `POST /api/v1/auth/login/professor` | idem, para docente |
| `POST /api/v1/auth/login/responsavel` | idem, para responsável |
| `GET /api/v1/auth/security/access-token` | retorna os dados de um token de acesso |

## Por que "login remoto" não resolve

`POST /api/v1/auth/login/aluno` recebe, todos em query string:

```
idAluno | ra | email        identificação do aluno
idOrg                       organização
redirectUrl                 para onde mandar depois de autenticar
redirectOnError             para onde mandar em caso de erro
```

E devolve `{ token, url }` — *"um token e um link de acesso para o portal do
aluno autenticado"*.

**Não há parâmetro de senha.** O que autentica a chamada é o token de
integração, não uma credencial do aluno. Isso significa que o endpoint serve
para o CPA **mandar um aluno já autenticado ao portal do JACAD** — a confiança
flui do CPA para o JACAD, não o contrário.

Usá-lo como login do CPA seria construir isto:

> o aluno digita o RA → o CPA chama `login/aluno` → o CPA considera o aluno
> autenticado

Ou seja, **entrar sabendo apenas o RA**, sem senha nenhuma. Numa avaliação em
que o anonimato depende de a pessoa certa estar respondendo, isso é pior que
ter uma senha local: qualquer um responderia no lugar de qualquer outro.

## Implicação de segurança do token de integração

Como `login/aluno` não pede senha, **quem tiver o `JACAD_TOKEN` consegue gerar
acesso ao portal de qualquer aluno da instituição**, sabendo só o RA. O token
de integração deixa de ser "credencial de leitura de dados" e passa a ser
equivalente a uma chave mestra dos portais.

Consequências práticas:

- `JACAD_TOKEN` nunca em repositório, log, dump ou variável de build de front;
- em produção, apenas no ambiente do servidor que roda a importação;
- a restrição de IP do JACAD, que hoje incomoda, é a principal proteção — vale
  mantê-la e tratá-la como controle de segurança, não como obstáculo.

## O SSO que resolve

`GET /api/v1/auth/security/access-token?accessToken=<uuid>` valida um token de
acesso e devolve os dados de quem ele representa. É a peça que permite inverter
a direção da confiança:

```
aluno entra no portal do JACAD (senha que ele já tem)
  → portal envia ao CPA com um accessToken
  → CPA valida o token e descobre quem é
  → sessão aberta, sem senha nova
```

Quem inicia é o **portal**, não o CPA. Essa direção é o ponto todo: o aluno já
provou identidade com a senha do JACAD antes de chegar aqui.

### Estado verificado em 08/09/2026

A permissão foi liberada e o fluxo foi testado ponta a ponta contra a API real,
com o RA de um aluno verdadeiro:

| Passo | Resultado |
|---|---|
| `POST /auth/login/aluno` (ra=…) | **200** — `{ token: <uuid>, url: /academico/core/remote/auth/aluno/<uuid>?idOrg=0 }` |
| `GET /auth/security/access-token` | **200** — devolve o cadastro do aluno |
| `GET /entrar/jacad?accessToken=…` | **307** → `/minhas-avaliacoes`, com cookie de sessão |
| `GET /minhas-avaliacoes` com o cookie | **200** — "Suas avaliações", ciclo listado |
| repetir a mesma URL com o token já usado | **307** → `/entrar?erro=Link+de+acesso+expirado+ou+inválido` |

Duas propriedades saíram do teste, não da especificação — ambas boas:

**O accessToken é de uso único.** A segunda chamada com o mesmo token é
recusada pelo JACAD. Isso importa porque o token viaja na query string, e query
string vaza: fica no histórico do navegador, em log de proxy, em `Referer`. Um
token que só serve uma vez limita esse vazamento a uma janela que já se fechou.
(O `Referer` em particular não chega a vazar aqui: `/entrar/jacad` responde
redirect, nunca renderiza página, então nenhum sub-recurso é buscado a partir
dessa URL.)

**O retorno traz o cadastro inteiro — 122 campos.** Além de `ra`, `nome` e
`email`, vêm CPF, RG, filiação, data de nascimento, estado civil, sexo, religião
e necessidade especial. A rota extrai **apenas `ra` e `email`**, o suficiente
para achar o usuário; o resto morre dentro da função — não é persistido, não é
logado, não sai de lá. `SSO_LOGIN` guarda só o `id` do usuário do CPA.

Confirmado no banco depois do teste:

```
acao      | matricula  | nome                           | dadosDepois
SSO_LOGIN | 2023104129 | Ricardo de Andrade Haddad Lane | (vazio)
```

### O que ainda falta — e é do lado do JACAD

O CPA está pronto e o portal até tem onde cadastrar o link (*Links
Alternativos*). O que falta é **uma tag que injete um `accessToken`** nesse
link. Único pedido à Jacad:

> Incluir uma tag de token — algo como `<access_token>` — entre as tags válidas
> do campo *Value* em Configurações do Portal do Aluno → Links Alternativos →
> Params. O endpoint que a valida (`/auth/security/access-token`) já existe e a
> permissão já está liberada para o Insted.

Com ela, o link do portal passa a apontar para `/entrar/jacad` e o SSO real
entra em produção sem nenhuma outra mudança.

A direção é o ponto todo. O caminho inverso — o CPA chamar `login/aluno` com um
RA digitado — autenticaria qualquer um que soubesse o RA de outro, e RA não é
segredo (ver "O que NÃO fazer", abaixo).

Quando o link existir, o endereço é:

```
https://<cpa>/entrar/jacad?accessToken=<token>
```

Em produção, sobre HTTPS: o cookie de sessão já sai com `Secure` quando
`NODE_ENV=production` (`httpOnly` e `SameSite=lax` valem sempre).

### O que NÃO fazer

Chamar `login/aluno` a partir do CPA, com o RA digitado pelo aluno, e considerar
isso autenticação. Seria entrar sabendo só o RA — que circula em lista de
chamada, trabalho em grupo e mural. Qualquer um responderia no lugar de outro, e
a avaliação perderia o sentido.


## O que o portal realmente oferece — e a decisão tomada

O SSO por token está pronto e testado, mas depende de o portal apresentar um
link com o `accessToken`. Fomos ver a tela onde esse link seria cadastrado:

**Configurações do Portal do Aluno → Links Alternativos → Cadastro de URL/Links**

Ela permite uma URL fixa mais parâmetros montados a partir de tags. As tags
disponíveis (aba **Params** → botão **Tags**) são:

```
<id_unidade_fisica>  <ra>              <curso_modalidade>  <turma>
<id_aluno>           <id_curso>        <curso>             <id_turma>
<unidade_fisica>     <cpf>             <id_perfil>         <email>
<nome>
```

**Não há tag de token.** E o campo *Criptografia*, que parecia a saída, oferece
apenas duas opções: `Nenhuma` e `Base 64`.

Base 64 é codificação, não criptografia: não tem chave, e qualquer pessoa
decodifica, altera e recodifica em segundos. Um `?ra=MjAyMzEwNDEyOQ==` não prova
nada sobre quem está do outro lado.

### A decisão

A CPA optou por usar o link mesmo assim, com o RA em Base 64, aceitando o risco
de forma explícita: a ferramenta não guarda nota, dinheiro nem dado sigiloso, e
o esforço de forjar um acesso não compensa o que se ganha com ele.

O que isso significa na prática, dito sem eufemismo: **quem souber o RA de um
colega responde no lugar dele**, e a resposta gravada não guarda indício disso —
o anonimato, que é o ponto do sistema, é justamente o que impede ligar resposta
a pessoa. Não existe correção posterior possível para um voto forjado.

### O que compensa o que dá para compensar

A porta não pode ser trancada, então ela é vigiada:

- toda entrada vira `PORTAL_LOGIN` na auditoria, com **IP e user agent**;
- tentativa de entrar com conta **ADMIN ou GESTOR** por essa porta é recusada e
  registrada como `PORTAL_LOGIN_RECUSADO` — um parâmetro que qualquer um forja
  jamais pode abrir o painel da CPA;
- o redirecionamento tira o RA da barra de endereços logo após a entrada.

Nada disso previne o abuso. O que muda é que um abuso em escala — dezenas de RAs
diferentes vindos do mesmo IP em poucos minutos — fica visível na trilha, e o
padrão é bem distinto do uso normal. Vale olhar a auditoria antes de fechar a
apuração.

Um limite por IP foi considerado e **descartado de propósito**: laboratório e
rede da instituição saem por um IP só, e o limite barraria alunos legítimos aos
montes para atrapalhar de leve quem estivesse abusando.

### Como configurar no JACAD

Em *Links Alternativos*, **Adicionar**:

| Campo | Valor |
|---|---|
| Descrição | `Avaliação Institucional` |
| URL/Link | `https://<cpa>/entrar/portal` |
| Status | `ATIVO` |

Na aba **Params**, um parâmetro:

| Campo | Valor |
|---|---|
| Key | `ra` |
| Value | `<ra>` |
| Criptografia | `Base 64` |
| Se nulo | `Não enviar` |

A rota aceita o RA **em Base 64 ou em texto puro** — a escolha fica numa combo
que alguém pode mudar sem avisar, e um chamado de suporte no meio da avaliação
custa mais que as três linhas que tratam os dois casos.

Atenção ao endereço: `https://` de verdade em produção. `localhost` só resolve
na máquina onde o servidor roda — serve para testar, não para aluno nenhum.

### O caminho de saída

Continua valendo pedir à Jacad **uma tag de token** nesta tela (algo como
`<access_token>`). O endpoint que a valida já existe, já tem a permissão
liberada e já foi testado ponta a ponta — falta só a tag. No dia em que existir,
troca-se a URL do link para `/entrar/jacad` e o problema acaba, sem mudar mais
nada no CPA.

## O login local, que continua existindo

O login local está implementado e testado: primeiro acesso confere RA + e-mail
do cadastro e o aluno define a própria senha (bcrypt). Não bloqueia abrir o
ciclo.

A senha local também tem uma vantagem que só aparece depois: se um dia o CPA
precisar ser auditado quanto ao anonimato, ele não depende de nenhum sistema
externo para saber quem estava autenticado.
