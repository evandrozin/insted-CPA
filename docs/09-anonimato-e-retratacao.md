# Anonimato e a janela de retratação

O sistema promete ao aluno, na tela de envio, que "nem a CPA nem a coordenação
conseguem ligar estas respostas a você". Este documento registra o que sustenta
essa frase, o que quase a desmentiu, e o preço combinado para permitir que um
envio feito por engano seja refeito.

## O desenho original

`EvaluationTask` guarda **quem** respondeu. `ResponseSet` guarda **o que** foi
respondido. Não há chave estrangeira entre os dois, e a única estrutura que
liga resposta a pessoa — `DraftAnswer` — é destruída dentro da mesma transação
que grava as respostas definitivas. Os `ResponseSet` de um mesmo envio são
inseridos em ordem embaralhada, para que a sequência de ids não os reagrupe.

## O furo que o relógio abriu

A ausência de FK não bastava. Medido na primeira resposta real do banco:

```
tarefa concluída    13:07:59.809
conjuntos gravados  13:07:59.624 … 13:07:59.788   (9 conjuntos)
```

`ResponseSet.submetidoEm` usava `now()` e `EvaluationTask.concluidaEm` recebia
`new Date()` na mesma transação. Os dois carimbos ficavam a **185 ms** de
distância, e reagrupar as respostas de cada pessoa virava uma consulta de uma
linha. A FK tinha sido removida; o relógio a recriou.

**Correção:** `submetidoEm` passou a ser gravado arredondado para o **dia**, à
meia-noite UTC do dia local. Todos os envios de um mesmo dia carregam carimbo
idêntico, e a proximidade temporal deixa de dizer qualquer coisa.

Risco residual, dito por honestidade: num dia em que uma única pessoa envie, o
grupo de conjuntos daquele dia é dela. Com 1.780 respondentes em duas semanas
isso só aconteceria nas pontas do período — mesma família de risco que o
`minimoRespostasExibicao` trata nos relatórios.

## A janela de retratação

A CPA pediu uma forma de liberar novo envio para quem enviou por engano —
mandou incompleto, clicou cedo, achou que a conexão tinha derrubado.

Isso **exige** um vínculo entre pessoa e resposta: para apagar o que alguém
enviou, é preciso saber o que foi dele. Não existe versão disso sem vínculo. A
única escolha real é **por quanto tempo o vínculo existe**.

O que foi implementado:

- no envio, um `loteId` aleatório é gravado na tarefa e em cada `ResponseSet`
  daquela submissão;
- enquanto o ciclo está **ABERTO**, a CPA pode liberar novo envio em
  *Ciclo → Respondentes*: o lote é apagado, a tarefa volta a PENDENTE e a
  pessoa responde do zero;
- ao **encerrar o ciclo**, `encerrarCiclo` zera o `loteId` dos dois lados. A
  partir daí não há como reagrupar as respostas de ninguém — nem para quem tem
  acesso ao banco. É irreversível de propósito.

Ou seja: durante a coleta, o anonimato é uma política; depois do encerramento,
passa a ser um fato. A trilha de auditoria registra quantos vínculos foram
apagados no fechamento.

### Por que apagar em vez de somar

Liberar sem apagar seria mais simples e não criaria vínculo nenhum. Foi
descartado: a pessoa passaria a contar **duas vezes** nas médias do professor, e
depois do encerramento ninguém conseguiria descobrir quais conjuntos eram
duplicados — o erro ficaria embutido no resultado para sempre.

### Envios anteriores ao mecanismo

Respostas gravadas antes disso existir não têm lote. A tela mostra "sem lote" e
recusa a liberação, explicando o motivo: reabrir sem conseguir localizar o que
foi gravado duplicaria as respostas.

## O que a queda de internet realmente faz

Menos do que se teme. A gravação é uma transação única: ou entra inteira, ou não
entra. Uma conexão que cai no meio não deixa meio envio — deixa a tarefa
pendente e os rascunhos intactos, e o aluno continua de onde parou.

O caso que a janela de retratação atende é outro: o aluno que **enviou de
verdade**, só que incompleto.
