'use server';

/**
 * Ciclos de avaliação — criação, configuração e mudança de estado.
 *
 * O ciclo da CPA é ANUAL: um ciclo por ano, cobrindo os semestres letivos
 * daquele ano. Ciclos anteriores nunca são apagados nem editados — são a série
 * histórica, e é dela que sai a comparação entre anos.
 *
 * O que pode mudar depende do estado:
 *
 *   RASCUNHO   tudo — semestres, formulários, datas, mensagens
 *   AGENDADO   datas e mensagens (o conteúdo já está definido)
 *   ABERTO     só mensagens e a data de fechamento (há gente respondendo)
 *   ENCERRADO  nada
 *   PUBLICADO  nada
 *
 * Como em `formularios/actions.ts`, isto grava direto no banco por Server
 * Action enquanto a API NestJS não existe.
 */
import { revalidatePath } from 'next/cache';
import { exigirPainel } from '@/lib/sessao';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { GeradorDeAlvos } from '@insted/avaliacao';

/** Estados em que o conteúdo (semestres, formulários) ainda pode mudar. */
const CONTEUDO_EDITAVEL = ['RASCUNHO'] as const;
/** Estados em que datas e mensagens ainda podem mudar. */
const AJUSTAVEL = ['RASCUNHO', 'AGENDADO', 'ABERTO'] as const;

async function estado(periodId: string) {
  const p = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
    select: { status: true, ano: true },
  });
  if (!p) throw new Error('Ciclo não encontrado.');
  return p;
}

async function exigirConteudoEditavel(periodId: string) {
  const { status } = await estado(periodId);
  if (!CONTEUDO_EDITAVEL.includes(status as 'RASCUNHO')) {
    throw new Error(
      `Ciclo ${status.toLowerCase()}: o conteúdo não pode mais mudar. Duplique para o próximo ano.`,
    );
  }
}

async function exigirAjustavel(periodId: string) {
  const { status } = await estado(periodId);
  if (!AJUSTAVEL.includes(status as 'RASCUNHO')) {
    throw new Error(`Ciclo ${status.toLowerCase()}: faz parte do histórico e não é mais alterado.`);
  }
}

// ----------------------------------------------------------------- criação

export async function criarCiclo(dados: FormData): Promise<void> {
  await exigirPainel();

  const ano = Number(dados.get('ano'));
  const nome = String(dados.get('nome') ?? '').trim() || `Avaliação Institucional ${ano}`;

  if (!ano || ano < 2000 || ano > 2100) throw new Error('Informe um ano válido.');

  // O semestre de referência é o mais recente do ano — só um ponto de
  // ancoragem; a abrangência real vem dos semestres vinculados.
  const term = await prisma.academicTerm.findFirst({
    where: { ano },
    orderBy: { semestre: 'desc' },
  });
  if (!term) {
    throw new Error(
      `Nenhum semestre letivo de ${ano} foi importado ainda. Importe do JACAD antes de criar o ciclo.`,
    );
  }

  const hoje = new Date();
  const ciclo = await prisma.evaluationPeriod.create({
    data: {
      nome,
      ano,
      termId: term.id,
      status: 'RASCUNHO',
      abreEm: hoje,
      fechaEm: new Date(hoje.getTime() + 15 * 24 * 60 * 60 * 1000),
      // Por padrão o ciclo cobre todos os semestres do ano — é o que "anual"
      // significa. A CPA pode desmarcar depois.
      semestres: {
        create: (await prisma.academicTerm.findMany({ where: { ano } })).map((t) => ({
          termId: t.id,
          rotulo: t.codigo,
        })),
      },
    },
  });

  revalidatePath('/periodos');
  redirect(`/periodos/${ciclo.id}`);
}

/**
 * Duplica um ciclo para outro ano, copiando a configuração.
 *
 * É o caminho normal de um ciclo anual: o de 2027 nasce igual ao de 2026, e o
 * de 2026 permanece intacto como histórico.
 */
export async function duplicarCiclo(dados: FormData): Promise<void> {
  await exigirPainel();

  const origemId = String(dados.get('origemId') ?? '');
  const ano = Number(dados.get('ano'));
  if (!ano) throw new Error('Informe o ano do novo ciclo.');

  const origem = await prisma.evaluationPeriod.findUnique({
    where: { id: origemId },
    include: { formularios: true },
  });
  if (!origem) throw new Error('Ciclo de origem não encontrado.');

  const term = await prisma.academicTerm.findFirst({
    where: { ano },
    orderBy: { semestre: 'desc' },
  });
  if (!term) throw new Error(`Nenhum semestre letivo de ${ano} foi importado ainda.`);

  const semestres = await prisma.academicTerm.findMany({ where: { ano } });
  const hoje = new Date();

  const novo = await prisma.evaluationPeriod.create({
    data: {
      nome: origem.nome.replace(String(origem.ano), String(ano)),
      descricao: origem.descricao,
      ano,
      termId: term.id,
      status: 'RASCUNHO',
      abreEm: hoje,
      fechaEm: new Date(hoje.getTime() + 15 * 24 * 60 * 60 * 1000),
      minimoRespostasExibicao: origem.minimoRespostasExibicao,
      mensagemBoasVindas: origem.mensagemBoasVindas,
      mensagemConclusao: origem.mensagemConclusao,
      semestres: { create: semestres.map((t) => ({ termId: t.id, rotulo: t.codigo })) },
      formularios: {
        create: origem.formularios.map((f) => ({
          formId: f.formId,
          publico: f.publico,
          obrigatorio: f.obrigatorio,
          anonimo: f.anonimo,
        })),
      },
    },
  });

  revalidatePath('/periodos');
  redirect(`/periodos/${novo.id}`);
}

// ------------------------------------------------------------ configuração

export async function salvarCiclo(dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  await exigirAjustavel(periodId);

  const nome = String(dados.get('nome') ?? '').trim();
  const descricao = String(dados.get('descricao') ?? '').trim();
  const abreEm = String(dados.get('abreEm') ?? '');
  const fechaEm = String(dados.get('fechaEm') ?? '');
  const minimo = Number(dados.get('minimoRespostasExibicao'));

  if (!nome) throw new Error('O nome do ciclo não pode ficar vazio.');
  if (!abreEm || !fechaEm) throw new Error('Informe as datas de abertura e fechamento.');
  if (new Date(fechaEm) <= new Date(abreEm)) {
    throw new Error('O fechamento tem de ser depois da abertura.');
  }
  if (!minimo || minimo < 1) {
    throw new Error('O mínimo de respostas para exibir resultado tem de ser ao menos 1.');
  }

  await prisma.evaluationPeriod.update({
    where: { id: periodId },
    data: {
      nome,
      descricao: descricao || null,
      abreEm: new Date(abreEm),
      fechaEm: new Date(fechaEm),
      minimoRespostasExibicao: minimo,
      mensagemBoasVindas: String(dados.get('mensagemBoasVindas') ?? '').trim() || null,
      mensagemConclusao: String(dados.get('mensagemConclusao') ?? '').trim() || null,
    },
  });

  revalidatePath(`/periodos/${periodId}`);
}

/** Liga ou desliga um semestre letivo do ciclo. */
export async function alternarSemestre(termId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  await exigirConteudoEditavel(periodId);

  const existente = await prisma.evaluationPeriodTerm.findUnique({
    where: { periodId_termId: { periodId, termId } },
  });

  if (existente) {
    const total = await prisma.evaluationPeriodTerm.count({ where: { periodId } });
    if (total <= 1) throw new Error('O ciclo precisa cobrir ao menos um semestre.');
    await prisma.evaluationPeriodTerm.delete({
      where: { periodId_termId: { periodId, termId } },
    });
  } else {
    const term = await prisma.academicTerm.findUnique({ where: { id: termId } });
    await prisma.evaluationPeriodTerm.create({
      data: { periodId, termId, rotulo: term?.codigo },
    });
  }

  revalidatePath(`/periodos/${periodId}`);
}

/** Liga ou desliga um formulário (por público) do ciclo. */
export async function alternarFormulario(formId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  await exigirConteudoEditavel(periodId);

  const existente = await prisma.periodForm.findUnique({
    where: { periodId_formId: { periodId, formId } },
  });

  if (existente) {
    await prisma.periodForm.delete({ where: { periodId_formId: { periodId, formId } } });
  } else {
    const form = await prisma.formTemplate.findUnique({ where: { id: formId } });
    if (!form) throw new Error('Formulário não encontrado.');
    await prisma.periodForm.create({
      data: { periodId, formId, publico: form.publico, obrigatorio: true, anonimo: true },
    });
  }

  revalidatePath(`/periodos/${periodId}`);
}

// ----------------------------------------------------------------- estados

export async function gerarAlvos(dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  await exigirConteudoEditavel(periodId);

  const r = await new GeradorDeAlvos(prisma).gerar(periodId);

  // A contagem fica registrada na trilha de auditoria — o painel mostra os
  // números a partir das tarefas geradas.
  await prisma.auditLog.create({
    data: {
      acao: 'PERIOD_GENERATE_TARGETS',
      entidade: 'EvaluationPeriod',
      entidadeId: periodId,
      dadosDepois: {
        tarefas: r.tarefas,
        alvos: r.alvos,
        semestres: r.semestresAbrangidos,
        avisos: r.avisos,
      },
    },
  });

  revalidatePath(`/periodos/${periodId}`);
}

export async function abrirCiclo(dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  const { status } = await estado(periodId);
  if (status !== 'RASCUNHO' && status !== 'AGENDADO') {
    throw new Error('Só um ciclo em rascunho ou agendado pode ser aberto.');
  }

  const tarefas = await prisma.evaluationTask.count({
    where: { periodId, status: { not: 'DISPENSADA' } },
  });
  if (tarefas === 0) {
    throw new Error('Gere as tarefas antes de abrir — sem elas ninguém tem o que responder.');
  }

  await prisma.evaluationPeriod.update({ where: { id: periodId }, data: { status: 'ABERTO' } });
  await prisma.auditLog.create({
    data: { acao: 'PERIOD_OPEN', entidade: 'EvaluationPeriod', entidadeId: periodId },
  });

  revalidatePath(`/periodos/${periodId}`);
  revalidatePath('/periodos');
}

export async function encerrarCiclo(dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  const { status } = await estado(periodId);
  if (status !== 'ABERTO') throw new Error('Só um ciclo aberto pode ser encerrado.');

  // Encerrar é o momento em que o anonimato deixa de ser promessa e passa a
  // ser fato: some o lote dos dois lados e nada mais liga pessoa a resposta —
  // nem para quem tem o banco. É irreversível de propósito, e é por isso que
  // a liberação de reenvio só funciona com o ciclo aberto.
  const [, tarefas, conjuntos] = await prisma.$transaction([
    prisma.evaluationPeriod.update({ where: { id: periodId }, data: { status: 'ENCERRADO' } }),
    prisma.evaluationTask.updateMany({
      where: { periodId, loteId: { not: null } },
      data: { loteId: null },
    }),
    prisma.responseSet.updateMany({
      where: { periodId, loteId: { not: null } },
      data: { loteId: null },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      acao: 'PERIOD_CLOSE',
      entidade: 'EvaluationPeriod',
      entidadeId: periodId,
      dadosDepois: {
        vinculosApagados: { tarefas: tarefas.count, conjuntos: conjuntos.count },
      },
    },
  });

  revalidatePath(`/periodos/${periodId}`);
  revalidatePath('/periodos');
}

/**
 * Apaga um ciclo criado por engano.
 *
 * Ciclo é barato de criar e caro de desfazer: ele arrasta tarefas, cards e o
 * vínculo com os formulários. Até agora não havia como remover nenhum, e a
 * lista ia acumulando tentativa — o que atrapalha na hora de escolher onde
 * gerar alvos ou ler relatório.
 *
 * Duas travas, por motivos diferentes:
 *
 * 1. CICLO COM RESPOSTA NÃO SE APAGA, em nenhuma situação. A resposta é
 *    anônima: apagada, não há como pedir de novo nem reconstruir — e a
 *    série histórica da CPA perde o ano inteiro. Para encerrar um ciclo que
 *    já rodou existe "encerrar", que preserva tudo.
 *
 * 2. O NOME PRECISA SER DIGITADO. Sem isso, um clique errado leva junto as
 *    1.780 tarefas de um ciclo aberto. Digitar o nome é o tipo de atrito que
 *    só incomoda quem clicou sem querer.
 */
export async function excluirCiclo(dados: FormData): Promise<void> {
  const eu = await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  const confirmacao = String(dados.get('confirmacao') ?? '').trim();

  const ciclo = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
    select: {
      nome: true,
      status: true,
      _count: { select: { tarefas: true, respostas: true } },
    },
  });
  if (!ciclo) throw new Error('Ciclo não encontrado.');

  if (ciclo._count.respostas > 0) {
    throw new Error(
      `Este ciclo já tem ${ciclo._count.respostas} conjunto(s) de resposta. Resposta de ` +
        'avaliação é anônima: apagada, não há como pedir de novo. Use "encerrar" para ' +
        'fechá-lo sem perder o que foi respondido.',
    );
  }

  if (confirmacao !== ciclo.nome) {
    throw new Error(
      `Para confirmar, digite o nome do ciclo exatamente: "${ciclo.nome}".`,
    );
  }

  // Tarefas, alvos, rascunhos e vínculos de formulário caem em cascata.
  await prisma.evaluationPeriod.delete({ where: { id: periodId } });

  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'PERIOD_DELETE',
      entidade: 'EvaluationPeriod',
      entidadeId: periodId,
      dadosAntes: {
        nome: ciclo.nome,
        status: ciclo.status,
        tarefas: ciclo._count.tarefas,
      },
    },
  });

  revalidatePath('/periodos');
  redirect('/periodos?ok=excluido');
}

/**
 * Tira pessoas do ciclo — quem entrou a mais.
 *
 * A tarefa NÃO é apagada: fica marcada DISPENSADA. É isso que impede a pessoa de
 * voltar sozinha — "Gerar tarefas" e "Incluir quem ficou de fora" reconhecem a
 * tarefa existente e não a recriam — e é o que deixa a lista de retirados
 * existir, com o desfazer ao lado.
 *
 * Os cards e os rascunhos são apagados na hora: rascunho é a única estrutura em
 * que pessoa e resposta coexistem, e quem foi retirado não tem por que guardar
 * o que escrevia.
 *
 * Quem JÁ ENVIOU é o caso delicado. Retirar sem apagar o envio deixaria a
 * resposta dele no resultado, contando como se ele estivesse no ciclo. Apagar é
 * irreversível — a resposta é anônima e não há como pedir de novo. Por isso só
 * acontece com `apagarRespostas` marcado, e só enquanto o ciclo está aberto:
 * depois do encerramento o vínculo entre pessoa e resposta não existe mais, e
 * não há como saber qual resposta era dele.
 */
export async function retirarDoCiclo(periodId: string, dados: FormData): Promise<void> {
  const eu = await exigirPainel();

  const { status } = await estado(periodId);
  if (status === 'ENCERRADO' || status === 'PUBLICADO') {
    throw new Error(
      'O ciclo já foi encerrado. Retirar alguém agora deixaria a resposta dele no resultado, ' +
        'e o vínculo entre pessoa e resposta já foi apagado — não há como achá-la.',
    );
  }

  const apagarRespostas = dados.get('apagarRespostas') === 'on';
  const motivo = String(dados.get('motivo') ?? '').trim().slice(0, 200);

  // As duas portas: linhas marcadas na tabela, ou uma lista de matrículas
  // colada — o caso de quem tem uma planilha dos que entraram a mais.
  const marcadas = dados.getAll('ids').map(String).filter(Boolean);
  const matriculas = [
    ...new Set(
      String(dados.get('matriculas') ?? '')
        .split(/[\s,;]+/)
        .map((m) => m.trim())
        .filter(Boolean),
    ),
  ];

  if (marcadas.length === 0 && matriculas.length === 0) {
    throw new Error('Marque quem sai na lista, ou informe as matrículas.');
  }
  if (matriculas.length > 300) {
    throw new Error('Até 300 matrículas por vez.');
  }

  const tarefas = await prisma.evaluationTask.findMany({
    where: {
      periodId,
      OR: [
        ...(marcadas.length ? [{ id: { in: marcadas } }] : []),
        ...(matriculas.length ? [{ respondent: { matricula: { in: matriculas } } }] : []),
      ],
    },
    select: {
      id: true,
      status: true,
      loteId: true,
      respondent: { select: { matricula: true, nome: true } },
    },
  });

  const emAberto = tarefas.filter((t) => t.status === 'PENDENTE' || t.status === 'EM_ANDAMENTO');
  const enviadas = tarefas.filter((t) => t.status === 'CONCLUIDA');
  const jaRetiradas = tarefas.filter((t) => t.status === 'DISPENSADA');

  // Enviou e o lote ainda existe: dá para localizar e apagar o que gravou.
  // Sem lote o envio é anterior à janela de retratação e não há como achá-lo.
  const apagaveis = apagarRespostas ? enviadas.filter((t) => t.loteId) : [];
  const semLote = apagarRespostas ? enviadas.filter((t) => !t.loteId).length : 0;
  const puladasPorEnvio = apagarRespostas ? 0 : enviadas.length;

  const retirar = [...emAberto, ...apagaveis];
  const ids = retirar.map((t) => t.id);
  const lotes = apagaveis.map((t) => t.loteId!);

  const naoEncontradas = matriculas.filter(
    (m) => !tarefas.some((t) => t.respondent.matricula === m),
  ).length;

  let respostasApagadas = 0;

  if (ids.length > 0) {
    await prisma.$transaction(
      async (tx) => {
        if (lotes.length > 0) {
          // Answer cai em cascata a partir de ResponseSet.
          const apagados = await tx.responseSet.deleteMany({ where: { loteId: { in: lotes } } });
          respostasApagadas = apagados.count;
        }

        await tx.draftAnswer.deleteMany({ where: { taskId: { in: ids } } });
        await tx.evaluationTaskTarget.deleteMany({ where: { taskId: { in: ids } } });
        await tx.evaluationTask.updateMany({
          where: { id: { in: ids } },
          data: {
            status: 'DISPENSADA',
            progresso: 0,
            iniciadaEm: null,
            concluidaEm: null,
            loteId: null,
          },
        });
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }

  const registro = await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'PERIOD_WITHDRAW_RESPONDENTS',
      entidade: 'EvaluationPeriod',
      entidadeId: periodId,
      dadosDepois: {
        motivo: motivo || null,
        apagouRespostas: apagarRespostas,
        retirados: retirar.slice(0, 300).map((t) => ({
          matricula: t.respondent.matricula,
          nome: t.respondent.nome,
          estava: t.status,
        })),
        totalRetirados: retirar.length,
        respostasApagadas,
        enviadasMantidas: puladasPorEnvio,
        semLote,
        jaRetiradas: jaRetiradas.length,
        naoEncontradas,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/periodos/${periodId}`);
  revalidatePath(`/periodos/${periodId}/respondentes`);
  redirect(`/periodos/${periodId}/respondentes?status=DISPENSADA&retirada=${registro.id}`);
}

/**
 * Desfaz uma retirada: a pessoa volta ao ciclo, com os cards gerados de novo.
 *
 * Apaga a tarefa dispensada e deixa a inclusão normal refazer — que confere a
 * elegibilidade de hoje. Quem não for mais elegível (aluno inativado entre uma
 * coisa e outra) não volta, e a tela diz por quê.
 */
export async function recolocarNoCiclo(periodId: string, taskId: string): Promise<void> {
  const eu = await exigirPainel();

  const { status } = await estado(periodId);
  if (status === 'ENCERRADO' || status === 'PUBLICADO') {
    throw new Error('O ciclo já foi encerrado.');
  }

  const tarefa = await prisma.evaluationTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      periodId: true,
      periodFormId: true,
      respondentId: true,
      status: true,
      respondent: { select: { matricula: true } },
    },
  });
  if (!tarefa || tarefa.periodId !== periodId) throw new Error('Tarefa não encontrada neste ciclo.');
  if (tarefa.status !== 'DISPENSADA') throw new Error('Esta pessoa não está retirada.');

  await prisma.evaluationTask.delete({ where: { id: taskId } });

  const r = await new GeradorDeAlvos(prisma).incluir(periodId, [tarefa.respondent.matricula]);

  // Não era elegível hoje (aluno inativado, sem matrícula no semestre…): a
  // inclusão recusou. Sem esta linha a pessoa estaria fora do ciclo E fora da
  // lista de retirados — o clique em "recolocar" a faria desaparecer. A tarefa
  // dispensada volta, e a tela diz por que não deu.
  if (r.incluidos.length === 0) {
    await prisma.evaluationTask.create({
      data: {
        periodId,
        periodFormId: tarefa.periodFormId,
        respondentId: tarefa.respondentId,
        status: 'DISPENSADA',
      },
    });
  }

  const registro = await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'PERIOD_REINSTATE_RESPONDENT',
      entidade: 'EvaluationPeriod',
      entidadeId: periodId,
      dadosDepois: {
        matricula: tarefa.respondent.matricula,
        voltou: r.incluidos.length > 0,
        recusados: r.recusados,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/periodos/${periodId}`);
  revalidatePath(`/periodos/${periodId}/respondentes`);
  redirect(`/periodos/${periodId}/respondentes?status=TODOS&recolocado=${registro.id}`);
}

export async function publicarResultados(dados: FormData): Promise<void> {
  await exigirPainel();

  const periodId = String(dados.get('periodId') ?? '');
  const { status } = await estado(periodId);
  if (status !== 'ENCERRADO') {
    throw new Error('Encerre a coleta antes de liberar os resultados.');
  }

  await prisma.evaluationPeriod.update({
    where: { id: periodId },
    data: { status: 'PUBLICADO', publicaResultadosEm: new Date() },
  });
  await prisma.auditLog.create({
    data: { acao: 'PERIOD_PUBLISH_RESULTS', entidade: 'EvaluationPeriod', entidadeId: periodId },
  });

  revalidatePath(`/periodos/${periodId}`);
  revalidatePath('/periodos');
}

/**
 * Devolve uma tarefa concluída ao estado pendente, apagando o que foi enviado.
 *
 * Para quando o aluno enviou por engano — mandou incompleto, clicou cedo, a
 * conexão caiu e ele achou que não tinha ido. Ele responde de novo, do zero.
 *
 * Só funciona com o ciclo ABERTO, porque depende do `loteId`, que é apagado no
 * encerramento. Depois disso não há como saber quais respostas eram de quem —
 * e essa impossibilidade é o produto, não uma limitação a contornar.
 *
 * Apagar em vez de somar é deliberado: reabrir sem apagar faria o aluno contar
 * duas vezes nas médias do professor, e não haveria como descobrir depois
 * quais conjuntos eram duplicados.
 */
export async function liberarReenvio(periodId: string, taskId: string): Promise<void> {
  await exigirPainel();

  const { status } = await estado(periodId);
  if (status !== 'ABERTO') {
    throw new Error('Só dá para liberar reenvio com o ciclo aberto: depois do encerramento, o vínculo entre pessoa e resposta é apagado.');
  }

  const tarefa = await prisma.evaluationTask.findUnique({
    where: { id: taskId },
    select: { id: true, periodId: true, status: true, loteId: true, respondentId: true },
  });

  if (!tarefa || tarefa.periodId !== periodId) throw new Error('Tarefa não encontrada neste ciclo.');
  if (tarefa.status !== 'CONCLUIDA') throw new Error('Esta pessoa ainda não enviou nada.');

  await prisma.$transaction(async (tx) => {
    // Sem lote, a tarefa é anterior a este mecanismo: dá para reabrir, mas não
    // dá para localizar o que foi gravado. Reabrir mesmo assim duplicaria as
    // respostas — melhor recusar e explicar que recusar em silêncio.
    if (!tarefa.loteId) {
      throw new Error(
        'Este envio foi gravado antes da janela de retratação existir e não pode mais ser localizado. ' +
          'Reabrir agora faria as respostas contarem duas vezes.',
      );
    }

    // Answer tem onDelete: Cascade a partir de ResponseSet.
    const apagados = await tx.responseSet.deleteMany({ where: { loteId: tarefa.loteId } });

    await tx.evaluationTaskTarget.updateMany({
      where: { taskId },
      data: { concluido: false },
    });

    await tx.evaluationTask.update({
      where: { id: taskId },
      data: { status: 'PENDENTE', progresso: 0, concluidaEm: null, iniciadaEm: null, loteId: null },
    });

    await tx.auditLog.create({
      data: {
        acao: 'REENVIO_LIBERADO',
        entidade: 'EvaluationTask',
        entidadeId: taskId,
        dadosDepois: { conjuntosApagados: apagados.count },
      },
    });
  });

  revalidatePath(`/periodos/${periodId}/respondentes`);
  revalidatePath(`/periodos/${periodId}`);
}

/**
 * Inclui no ciclo quem ficou de fora — inclusive com ele já aberto.
 *
 * O caso real: a matrícula que a secretaria regulariza na segunda semana da
 * coleta, o aluno que o JACAD devolveu depois da geração. O botão de gerar
 * fica travado com o ciclo aberto, de propósito — recalcular os cards de quem
 * já começou a responder descartaria o rascunho dele. Esta ação é a porta
 * estreita: só cria tarefa para quem ainda não tem, e não toca em mais nada.
 *
 * Aceita matrículas (uma por linha, ou separadas por vírgula) ou, sem nenhuma,
 * todos os elegíveis que ainda não têm tarefa.
 *
 * O resultado — quem entrou e por que os outros não — vai para a auditoria, e
 * a tela o lê de lá pelo id. Nome de aluno não viaja na URL: ela fica no
 * histórico do navegador e no log de qualquer proxy.
 */
/**
 * `modo` vem por `bind`, e não por `name` do botão: o React troca o `name` de
 * um botão com ação por um identificador próprio, servidor e navegador
 * passavam a discordar do atributo, e "incluir todos os elegíveis" podia
 * chegar aqui sem o modo — caindo no padrão "lista" com a caixa vazia.
 */
export async function incluirRespondentes(
  periodId: string,
  modo: 'lista' | 'todos',
  dados: FormData,
): Promise<void> {
  await exigirPainel();

  const { status } = await estado(periodId);
  if (status === 'ENCERRADO' || status === 'PUBLICADO') {
    throw new Error(
      'O ciclo já foi encerrado: incluir alguém agora criaria uma tarefa que ninguém pode responder.',
    );
  }

  const bruto = String(dados.get('matriculas') ?? '');
  const matriculas = [...new Set(bruto.split(/[\s,;]+/).map((m) => m.trim()).filter(Boolean))];

  if (modo === 'lista' && matriculas.length === 0) {
    throw new Error('Informe ao menos uma matrícula, ou use "incluir todos os que faltam".');
  }
  if (matriculas.length > 200) {
    throw new Error('Até 200 matrículas por vez. Para volume maior, use "incluir todos os que faltam".');
  }

  const r = await new GeradorDeAlvos(prisma).incluir(
    periodId,
    modo === 'lista' ? matriculas : undefined,
  );

  const registro = await prisma.auditLog.create({
    data: {
      acao: 'PERIOD_INCLUDE_RESPONDENTS',
      entidade: 'EvaluationPeriod',
      entidadeId: periodId,
      dadosDepois: {
        modo,
        incluidos: r.incluidos.slice(0, 200),
        recusados: r.recusados.slice(0, 200),
        totalIncluidos: r.incluidos.length,
        totalRecusados: r.recusados.length,
        alvos: r.alvos,
      },
    },
    select: { id: true },
  });

  revalidatePath(`/periodos/${periodId}`);
  revalidatePath(`/periodos/${periodId}/respondentes`);
  redirect(`/periodos/${periodId}/respondentes?status=TODOS&inclusao=${registro.id}`);
}
