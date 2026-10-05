'use server';

/**
 * Edição de formulários pela interface.
 *
 * Server Actions escrevendo direto no banco. É provisório e consciente: a
 * arquitetura prevê o admin consumindo a API NestJS, que ainda não existe.
 * Quando ela entrar, estas funções viram chamadas HTTP e as regras (RBAC,
 * auditoria) passam a viver num lugar só. Até lá, cada ação repete aqui a
 * única regra que não pode faltar: formulário PUBLICADO é imutável.
 *
 * Reordenação: `ordem` tem constraint única por bloco (e por formulário), então
 * uma troca direta violaria o índice no meio da transação. Por isso o swap
 * passa por uma ordem temporária negativa.
 */
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirPainel } from '@/lib/sessao';
import { prisma, publicarFormulario as publicar, type TargetType } from '@insted/database';
import type { Prisma } from '@insted/database';
import { TIPOS_ALVO, ALVOS_REPETIVEIS } from './alvos';

const TEMP = -1;

/** Publicado é imutável — a série histórica da CPA depende disso. */
async function exigirRascunho(formId: string): Promise<string | null> {
  const form = await prisma.formTemplate.findUnique({
    where: { id: formId },
    select: { status: true },
  });
  if (!form) return 'Formulário não encontrado.';
  if (form.status !== 'RASCUNHO') {
    return 'Este formulário está publicado e não pode ser alterado. Crie uma nova versão.';
  }
  return null;
}

async function formIdDaQuestao(questionId: string) {
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { block: { select: { formId: true, id: true } } },
  });
  return q?.block ?? null;
}

// ------------------------------------------------------------------ questões

export async function salvarQuestao(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const enunciado = String(dados.get('enunciado') ?? '').trim();
  const ajuda = String(dados.get('ajuda') ?? '').trim();

  if (!enunciado) throw new Error('O enunciado não pode ficar vazio.');

  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  await prisma.question.update({
    where: { id: questionId },
    data: { enunciado, ajuda: ajuda || null },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

export async function alternarObrigatoria(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const atual = await prisma.question.findUnique({
    where: { id: questionId },
    select: { obrigatoria: true },
  });
  await prisma.question.update({
    where: { id: questionId },
    data: { obrigatoria: !atual?.obrigatoria },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

/** Peso 0 tira a questão da média do bloco — útil para itens informativos. */
export async function alternarPeso(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const atual = await prisma.question.findUnique({
    where: { id: questionId },
    select: { peso: true },
  });
  await prisma.question.update({
    where: { id: questionId },
    data: { peso: Number(atual?.peso) === 0 ? 1 : 0 },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

/**
 * A direção vem por bind, não por campo do formulário: o React usa o atributo
 * `name` do botão para carregar o id da Server Action, e um `name` próprio é
 * sobrescrito — o valor nunca chegaria aqui.
 */
export async function moverQuestao(sentido: 'cima' | 'baixo', dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const direcao = sentido === 'cima' ? -1 : 1;

  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { id: true, ordem: true, blockId: true, block: { select: { formId: true } } },
  });
  if (!q) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(q.block.formId);
  if (impedimento) throw new Error(impedimento);

  const vizinha = await prisma.question.findFirst({
    where: { blockId: q.blockId, ordem: q.ordem + direcao },
    select: { id: true, ordem: true },
  });
  if (!vizinha) return; // já está na ponta

  await prisma.$transaction([
    prisma.question.update({ where: { id: q.id }, data: { ordem: TEMP } }),
    prisma.question.update({ where: { id: vizinha.id }, data: { ordem: q.ordem } }),
    prisma.question.update({ where: { id: q.id }, data: { ordem: vizinha.ordem } }),
  ]);

  revalidatePath(`/formularios/${q.block.formId}`);
}

export async function excluirQuestao(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    select: { ordem: true, blockId: true, block: { select: { formId: true } } },
  });
  if (!q) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(q.block.formId);
  if (impedimento) throw new Error(impedimento);

  // Fecha o buraco na numeração para manter a ordem contígua.
  await prisma.$transaction(async (tx) => {
    await tx.question.delete({ where: { id: questionId } });
    const posteriores = await tx.question.findMany({
      where: { blockId: q.blockId, ordem: { gt: q.ordem } },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true },
    });
    for (const p of posteriores) {
      await tx.question.update({ where: { id: p.id }, data: { ordem: p.ordem - 1 } });
    }
  });

  revalidatePath(`/formularios/${q.block.formId}`);
}

export async function adicionarQuestao(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const bloco = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, questoes: { orderBy: { ordem: 'desc' }, take: 1 } },
  });
  if (!bloco) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  // Herda a escala da última questão, que é quase sempre o que se quer.
  const ultima = bloco.questoes[0];

  await prisma.question.create({
    data: {
      blockId,
      enunciado: 'Nova questão — escreva o enunciado aqui.',
      tipo: ultima?.tipo ?? 'LIKERT',
      ordem: (ultima?.ordem ?? 0) + 1,
      config: (ultima?.config ?? undefined) as object | undefined,
    },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

// --------------------------------------------------------------- alternativas

/** Tipos que a tela de resposta sabe desenhar — ver responder/[taskId]. */
const TIPOS = [
  'LIKERT',
  'NPS',
  'TEXTO_LIVRE',
  'SIM_NAO',
  'ESCOLHA_UNICA',
  'ESCOLHA_MULTIPLA',
] as const;

type Tipo = (typeof TIPOS)[number];

const ESCOLHAS: Tipo[] = ['ESCOLHA_UNICA', 'ESCOLHA_MULTIPLA'];

/** Régua padrão de quem vira escala sem ter uma: a do instrumento de 2026. */
const ESCALA_PADRAO = {
  min: 1,
  max: 4,
  labels: { 1: 'Discordo totalmente', 2: 'Discordo', 3: 'Concordo', 4: 'Concordo totalmente' },
};

/**
 * Reescreve as alternativas de uma questão, uma por linha.
 *
 * Alternativa cujo rótulo não mudou MANTÉM o id. Isso não é detalhe: a resposta
 * aponta para o id da alternativa, então recriar tudo a cada salvamento
 * transformaria "corrigi um acento na terceira opção" em "perdi a contagem das
 * outras doze". Em rascunho ainda não há resposta, mas a mesma função serve à
 * versão seguinte de um formulário já usado.
 */
export async function salvarAlternativas(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const rotulos = String(dados.get('alternativas') ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // Duas alternativas com o mesmo texto são indistinguíveis no resultado:
  // quem lesse o relatório veria a mesma linha duas vezes, com contagens
  // diferentes, sem ter como saber qual é qual.
  const repetido = rotulos.find((r, i) => rotulos.indexOf(r) !== i);
  if (repetido) throw new Error(`Alternativa repetida: "${repetido}".`);

  const atuais = await prisma.questionOption.findMany({
    where: { questionId },
    select: { id: true, rotulo: true },
  });
  const idDoRotulo = new Map(atuais.map((o) => [o.rotulo, o.id]));
  const preservados = new Set(
    rotulos.map((r) => idDoRotulo.get(r)).filter((id): id is string => Boolean(id)),
  );
  const aRemover = atuais.filter((o) => !preservados.has(o.id));

  // Alternativa já marcada por alguém não pode sumir: o banco recusaria a
  // exclusão (a resposta aponta para ela) e o erro chegaria como violação de
  // chave estrangeira, que não diz a ninguém o que fazer. Rascunho normalmente
  // não tem resposta — mas um ciclo pode apontar para formulário em rascunho,
  // e aí tem.
  if (aRemover.length > 0) {
    const respondidas = await prisma.answerOption.groupBy({
      by: ['optionId'],
      where: { optionId: { in: aRemover.map((o) => o.id) } },
      _count: true,
    });
    if (respondidas.length > 0) {
      const nomes = respondidas
        .map((r) => {
          const o = aRemover.find((x) => x.id === r.optionId);
          return `"${o?.rotulo}" (${r._count} resposta(s))`;
        })
        .join(', ');
      throw new Error(
        `Não dá para remover ou renomear alternativa já respondida: ${nomes}. ` +
          'Reescrever mudaria o que essas pessoas marcaram. Crie uma nova versão do formulário.',
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.questionOption.deleteMany({
      where: { questionId, id: { notIn: [...preservados] } },
    });

    // A ordem é única por questão: as sobreviventes vão para posições
    // negativas antes de assumirem a ordem nova, senão a primeira renumeração
    // já colidiria com uma posição ainda ocupada.
    let temp = TEMP;
    for (const id of preservados) {
      await tx.questionOption.update({ where: { id }, data: { ordem: temp-- } });
    }

    for (const [i, rotulo] of rotulos.entries()) {
      const id = idDoRotulo.get(rotulo);
      if (id && preservados.has(id)) {
        await tx.questionOption.update({ where: { id }, data: { ordem: i } });
      } else {
        await tx.questionOption.create({ data: { questionId, rotulo, ordem: i } });
      }
    }
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

/**
 * Troca o tipo da questão.
 *
 * As alternativas de uma questão que deixou de ser de escolha ficam guardadas:
 * trocar o tipo por engano e voltar atrás não deve custar a redigitação das
 * treze opções. Elas não aparecem para o aluno enquanto o tipo não voltar.
 */
export async function definirTipo(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const tipo = String(dados.get('tipo') ?? '') as Tipo;
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de questão desconhecido.');

  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const atual = await prisma.question.findUnique({
    where: { id: questionId },
    select: { config: true },
  });
  const cfg = (atual?.config ?? null) as Record<string, unknown> | null;

  // Escala sem régua não desenha botão nenhum; NPS sem faixa cai no 0–10 do
  // próprio componente, mas deixar explícito evita depender desse padrão.
  let config = cfg ?? undefined;
  if (tipo === 'LIKERT' && !cfg?.labels) config = ESCALA_PADRAO;
  if (tipo === 'NPS' && cfg?.min === undefined) config = { min: 0, max: 10 };
  if (tipo === 'TEXTO_LIVRE' && cfg?.maxLength === undefined) config = { maxLength: 500 };

  await prisma.question.update({
    where: { id: questionId },
    data: { tipo, config: config as object | undefined },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

/** Vale só para escala: libera (ou tira) a categoria fora da pontuação. */
export async function alternarNaoSeAplica(dados: FormData): Promise<void> {
  await exigirPainel();

  const questionId = String(dados.get('questionId') ?? '');
  const rotulo = String(dados.get('rotuloNaoSeAplica') ?? '').trim();

  const bloco = await formIdDaQuestao(questionId);
  if (!bloco) throw new Error('Questão não encontrada.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const atual = await prisma.question.findUnique({
    where: { id: questionId },
    select: { config: true, tipo: true },
  });
  if (atual?.tipo !== 'LIKERT' && atual?.tipo !== 'NPS') {
    throw new Error('A categoria "não se aplica" existe só em escala.');
  }

  const cfg = ((atual?.config ?? {}) as Record<string, unknown>) ?? {};
  const ligado = Boolean(cfg.permiteNaoSeAplica);

  await prisma.question.update({
    where: { id: questionId },
    data: {
      config: {
        ...cfg,
        permiteNaoSeAplica: !ligado,
        // O texto específico ("Não utilizei a biblioteca...") diz ao aluno que
        // não usar o serviço é resposta válida, e não nota baixa disfarçada.
        rotuloNaoSeAplica: !ligado && rotulo ? rotulo : undefined,
      } as object,
    },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

// -------------------------------------------------------------------- blocos

export async function salvarBloco(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const titulo = String(dados.get('titulo') ?? '').trim();
  const descricao = String(dados.get('descricao') ?? '').trim();
  const targetType = String(dados.get('targetType') ?? '') as TargetType;
  const repetivelPedido = dados.get('repetivel') === 'on';

  if (!titulo) throw new Error('O título do bloco não pode ficar vazio.');

  const bloco = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, targetType: true, repetivel: true },
  });
  if (!bloco) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  const alvo = TIPOS_ALVO.includes(targetType) ? targetType : bloco.targetType;
  // "Repetir" sobre um alvo único geraria um card só — silenciosamente inútil.
  const repetivel = repetivelPedido && ALVOS_REPETIVEIS.includes(alvo);

  await prisma.questionBlock.update({
    where: { id: blockId },
    data: { titulo, descricao: descricao || null, targetType: alvo, repetivel },
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

export async function adicionarBloco(dados: FormData): Promise<void> {
  await exigirPainel();

  const formId = String(dados.get('formId') ?? '');
  const impedimento = await exigirRascunho(formId);
  if (impedimento) throw new Error(impedimento);

  const ultimo = await prisma.questionBlock.findFirst({
    where: { formId },
    orderBy: { ordem: 'desc' },
    select: { ordem: true },
  });

  await prisma.questionBlock.create({
    data: {
      formId,
      titulo: 'Novo bloco',
      ordem: (ultimo?.ordem ?? 0) + 1,
      targetType: 'INSTITUICAO',
    },
  });

  revalidatePath(`/formularios/${formId}`);
}

export async function excluirBloco(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const bloco = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, ordem: true, _count: { select: { questoes: true } } },
  });
  if (!bloco) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(bloco.formId);
  if (impedimento) throw new Error(impedimento);

  // As questões vão junto por cascade; fechamos o buraco na ordem depois.
  await prisma.$transaction(async (tx) => {
    await tx.questionBlock.delete({ where: { id: blockId } });
    const posteriores = await tx.questionBlock.findMany({
      where: { formId: bloco.formId, ordem: { gt: bloco.ordem } },
      orderBy: { ordem: 'asc' },
      select: { id: true, ordem: true },
    });
    for (const p of posteriores) {
      await tx.questionBlock.update({ where: { id: p.id }, data: { ordem: p.ordem - 1 } });
    }
  });

  revalidatePath(`/formularios/${bloco.formId}`);
}

export async function moverBloco(sentido: 'cima' | 'baixo', dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const direcao = sentido === 'cima' ? -1 : 1;

  const b = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { id: true, ordem: true, formId: true },
  });
  if (!b) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(b.formId);
  if (impedimento) throw new Error(impedimento);

  const vizinho = await prisma.questionBlock.findFirst({
    where: { formId: b.formId, ordem: b.ordem + direcao },
    select: { id: true, ordem: true },
  });
  if (!vizinho) return;

  await prisma.$transaction([
    prisma.questionBlock.update({ where: { id: b.id }, data: { ordem: TEMP } }),
    prisma.questionBlock.update({ where: { id: vizinho.id }, data: { ordem: b.ordem } }),
    prisma.questionBlock.update({ where: { id: b.id }, data: { ordem: vizinho.ordem } }),
  ]);

  revalidatePath(`/formularios/${b.formId}`);
}

/**
 * Marca o bloco como repetível por professor — a conversão que a CPA precisa
 * decidir para ter nota por docente em vez de nota do "corpo docente".
 */
export async function alternarRepetivelDocente(dados: FormData): Promise<void> {
  await exigirPainel();

  const blockId = String(dados.get('blockId') ?? '');
  const b = await prisma.questionBlock.findUnique({
    where: { id: blockId },
    select: { formId: true, repetivel: true, targetType: true },
  });
  if (!b) throw new Error('Bloco não encontrado.');
  const impedimento = await exigirRascunho(b.formId);
  if (impedimento) throw new Error(impedimento);

  const virandoRepetivel = !b.repetivel;

  await prisma.questionBlock.update({
    where: { id: blockId },
    data: {
      repetivel: virandoRepetivel,
      targetType: virandoRepetivel ? 'PROFESSOR_DISCIPLINA' : 'INSTITUICAO',
    },
  });

  revalidatePath(`/formularios/${b.formId}`);
}

/**
 * Publica o formulário.
 *
 * A regra vive em `@insted/database` porque a tela não é o único lugar que
 * publica — um script de ambiente também precisa, e o snapshot congelado não
 * pode depender de qual caminho foi usado.
 */
/**
 * Cria a próxima versão de um formulário, como rascunho editável.
 *
 * É a única saída para mudar um instrumento já publicado: publicado é imutável
 * porque a série histórica depende de saber que a pergunta era a mesma. A
 * versão nova nasce idêntica — blocos, questões, alternativas, escalas e pesos
 * — e dali em diante segue a própria vida.
 *
 * Os ciclos que usam a versão antiga continuam intocados, inclusive os abertos:
 * trocar o instrumento debaixo de quem já respondeu misturaria duas perguntas
 * diferentes na mesma coluna. Para o ciclo seguinte, é a CPA quem escolhe a
 * versão nova ao montá-lo.
 *
 * Grava em quatro inserts, com ids gerados aqui. Criar linha a linha seriam
 * ~200 idas ao banco para o formulário docente: na Vercel, com o banco em São
 * Paulo, isso estoura o tempo da transação e a cópia falha pela metade.
 */
export async function duplicarFormulario(formId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const origem = await prisma.formTemplate.findUnique({
    where: { id: formId },
    include: {
      blocos: {
        orderBy: { ordem: 'asc' },
        include: {
          questoes: {
            orderBy: { ordem: 'asc' },
            include: { opcoes: { orderBy: { ordem: 'asc' } } },
          },
        },
      },
    },
  });
  if (!origem) throw new Error('Formulário não encontrado.');

  // A versão nova vem depois da MAIOR que existe, não da que está aberta na
  // tela: duplicar duas vezes a v1 tem que dar v2 e v3, não v2 e v2.
  const ultima = await prisma.formTemplate.findFirst({
    where: { nome: origem.nome },
    orderBy: { versao: 'desc' },
    select: { versao: true },
  });
  const versao = (ultima?.versao ?? origem.versao) + 1;

  const novoId = randomUUID();
  const blocos: Prisma.QuestionBlockCreateManyInput[] = [];
  const questoes: Prisma.QuestionCreateManyInput[] = [];
  const opcoes: Prisma.QuestionOptionCreateManyInput[] = [];

  for (const b of origem.blocos) {
    const blocoId = randomUUID();
    blocos.push({
      id: blocoId,
      formId: novoId,
      titulo: b.titulo,
      descricao: b.descricao,
      ordem: b.ordem,
      targetType: b.targetType,
      repetivel: b.repetivel,
      targetFiltro: b.targetFiltro ?? undefined,
      obrigatorio: b.obrigatorio,
    });

    for (const q of b.questoes) {
      const questaoId = randomUUID();
      questoes.push({
        id: questaoId,
        blockId: blocoId,
        enunciado: q.enunciado,
        ajuda: q.ajuda,
        tipo: q.tipo,
        ordem: q.ordem,
        obrigatoria: q.obrigatoria,
        config: q.config ?? undefined,
        peso: q.peso,
        condicao: q.condicao ?? undefined,
        ativa: q.ativa,
      });

      for (const o of q.opcoes) {
        opcoes.push({
          id: randomUUID(),
          questionId: questaoId,
          rotulo: o.rotulo,
          valor: o.valor,
          ordem: o.ordem,
        });
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.formTemplate.create({
      data: {
        id: novoId,
        nome: origem.nome,
        descricao: origem.descricao,
        publico: origem.publico,
        versao,
        status: 'RASCUNHO',
      },
    });
    await tx.questionBlock.createMany({ data: blocos });
    await tx.question.createMany({ data: questoes });
    if (opcoes.length > 0) await tx.questionOption.createMany({ data: opcoes });
  });

  revalidatePath('/formularios');
  redirect(`/formularios/${novoId}?novo=${versao}`);
}

export async function publicarFormulario(formId: string, dados: FormData): Promise<void> {
  await exigirPainel();
  await publicar(prisma, formId);

  const volta = String(dados.get('volta') ?? `/formularios/${formId}`);
  revalidatePath('/formularios');
  revalidatePath(volta);
}
