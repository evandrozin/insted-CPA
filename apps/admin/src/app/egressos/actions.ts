'use server';

/**
 * Envio do questionário de egressos — página pública, sem login.
 *
 * Decisão da comissão: o egresso não tem matrícula, conta nem portal, e a
 * pesquisa é aberta ("não precisa de validação nenhuma"). O que se pede dele é
 * o curso de origem. Aqui não há tarefa, rascunho nem sessão: a resposta entra
 * de uma vez, já anônima, e não existe vínculo a desfazer.
 *
 * Isto NÃO impede que a mesma pessoa responda duas vezes, nem que alguém que
 * nunca estudou aqui responda. É o preço de não validar. O que se faz é limitar
 * o estrago:
 *
 * - um campo-isca que pessoa nenhuma vê (robô preenche e é descartado);
 * - limite de envios por origem, medido por uma impressão da rede (HMAC do IP),
 *   nunca pelo IP em si: o registro de auditoria não pode apontar de volta
 *   para quem respondeu;
 * - tudo o que chega é conferido contra o formulário: pergunta que não é dele,
 *   alternativa de outra pergunta, nota fora da escala e texto grande demais
 *   são descartados ou recusados;
 * - só vale com um ciclo de egressos ABERTO.
 *
 * Erros voltam por redirecionamento, não por `throw`: em produção o Next troca
 * a mensagem de qualquer erro de ação por um texto genérico.
 */
import { createHmac, randomUUID } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import type { Prisma } from '@insted/database';
import { cicloDeEgressos } from '@/lib/egressos';
import { condicaoSatisfeita, lerCondicao, type ValorRespondido } from '@/lib/condicao';

const TELA = '/egressos';
const LIMITE_POR_HORA = 30;

function voltar(erro: string): never {
  redirect(`${TELA}?${new URLSearchParams({ erro })}`);
}

/** Impressão da rede do respondente: serve para limitar abuso e não aponta de volta. */
async function impressaoDaRede(): Promise<string> {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0].trim() ?? h.get('x-real-ip') ?? 'desconhecido';
  const segredo = process.env.SESSION_SECRET ?? 'egressos';
  return createHmac('sha256', segredo).update(`egressos:${ip}`).digest('hex').slice(0, 24);
}

type Config = { min?: number; max?: number; maxLength?: number };

export async function enviarEgresso(dados: FormData): Promise<void> {
  // Isca: quem preenche é robô. Responde como se tivesse dado certo e não grava.
  if (String(dados.get('website') ?? '') !== '') redirect(`${TELA}/concluido`);

  const rede = await impressaoDaRede();
  const desde = new Date(Date.now() - 60 * 60_000);
  const recentes = await prisma.auditLog.count({
    where: { acao: 'EGRESSO_ENVIO', criadoEm: { gte: desde }, dadosDepois: { path: ['rede'], equals: rede } },
  });
  if (recentes >= LIMITE_POR_HORA) {
    voltar('Muitos envios desta rede em pouco tempo. Tente de novo mais tarde.');
  }

  const ciclo = await cicloDeEgressos();
  const periodForm = ciclo?.formularios[0];
  if (!ciclo || !periodForm) {
    voltar('A pesquisa de egressos não está aberta no momento.');
  }

  // Curso de origem: um curso cadastrado ou "outro" (aí vale a pergunta aberta).
  const cursoEscolhido = String(dados.get('curso') ?? '');
  if (!cursoEscolhido) voltar('Escolha o curso que você concluiu.');
  let cursoId: string | null = null;
  if (cursoEscolhido !== 'outro') {
    const curso = await prisma.course.findUnique({
      where: { id: cursoEscolhido },
      select: { id: true },
    });
    if (!curso) voltar('Curso inválido. Escolha um da lista.');
    cursoId = curso.id;
  }

  // Campos `r:<questionId>:__global__`; caixas repetidas chegam como várias entradas.
  const porCampo = new Map<string, string[]>();
  for (const [chave, bruto] of dados.entries()) {
    if (!chave.startsWith('r:')) continue;
    const v = String(bruto);
    if (v === '') continue;
    porCampo.set(chave, [...(porCampo.get(chave) ?? []), v]);
  }
  const lidas = new Map<string, string[]>();
  for (const [chave, valores] of porCampo) lidas.set(chave.split(':')[1], valores);

  const interpretar = (valores: string[]): ValorRespondido => {
    const opcoes = valores.filter((v) => v.startsWith('o:')).map((v) => v.slice(2));
    if (opcoes.length > 0) return { opcoes };
    const v = valores[valores.length - 1];
    if (/^-?\d+$/.test(v)) return { numerico: Number(v) };
    if (v === 'sim' || v === 'nao') return { booleano: v === 'sim' };
    return { texto: v };
  };

  const blocos = periodForm.form.blocos;
  const todas = blocos.flatMap((b) => b.questoes.map((q) => ({ ...q, blockId: b.id })));

  // Primeiro o que foi respondido, validado pelo tipo; depois a condicional e a
  // obrigatória, que dependem do conjunto.
  const aceitas = new Map<string, ValorRespondido>();
  for (const q of todas) {
    const bruto = lidas.get(q.id);
    if (!bruto) continue;
    const v = interpretar(bruto);
    const cfg = (q.config ?? {}) as Config;

    if (q.tipo === 'LIKERT' || q.tipo === 'NPS') {
      const min = cfg.min ?? (q.tipo === 'NPS' ? 0 : 1);
      const max = cfg.max ?? (q.tipo === 'NPS' ? 10 : 5);
      if (typeof v.numerico !== 'number' || v.numerico < min || v.numerico > max) continue;
      aceitas.set(q.id, { numerico: v.numerico });
    } else if (q.tipo === 'SIM_NAO') {
      if (typeof v.booleano !== 'boolean') continue;
      aceitas.set(q.id, { booleano: v.booleano });
    } else if (q.tipo === 'ESCOLHA_UNICA' || q.tipo === 'ESCOLHA_MULTIPLA') {
      const validas = new Set(q.opcoes.map((o) => o.id));
      let marcadas = (v.opcoes ?? []).filter((o) => validas.has(o));
      if (q.tipo === 'ESCOLHA_UNICA') marcadas = marcadas.slice(0, 1);
      if (marcadas.length === 0) continue;
      aceitas.set(q.id, { opcoes: marcadas });
    } else {
      const texto = (v.texto ?? bruto[bruto.length - 1]).trim().slice(0, cfg.maxLength ?? 1000);
      if (!texto) continue;
      aceitas.set(q.id, { texto });
    }
  }

  // Condicional que não se cumpre é descartada; obrigatória que falta é recusada.
  for (const q of todas) {
    const condicao = lerCondicao(q.condicao);
    if (condicao && !condicaoSatisfeita(condicao, aceitas.get(condicao.questionId))) {
      aceitas.delete(q.id);
    }
  }
  const faltando = todas.filter((q) => {
    if (!q.obrigatoria || aceitas.has(q.id)) return false;
    const condicao = lerCondicao(q.condicao);
    return !condicao || condicaoSatisfeita(condicao, aceitas.get(condicao.questionId));
  });
  if (faltando.length > 0) {
    voltar(
      faltando.length === 1
        ? 'Falta 1 pergunta obrigatória. Confira o formulário.'
        : `Faltam ${faltando.length} perguntas obrigatórias. Confira o formulário.`,
    );
  }
  if (aceitas.size === 0) voltar('Nenhuma resposta preenchida.');

  // Um conjunto por bloco com resposta, gravados em ordem embaralhada.
  const hoje = new Date();
  const dia = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
  const conjuntos: Prisma.ResponseSetCreateManyInput[] = [];
  const respostas: Prisma.AnswerCreateManyInput[] = [];
  const marcacoes: Prisma.AnswerOptionCreateManyInput[] = [];

  const blocosComResposta = blocos
    .filter((b) => b.questoes.some((q) => aceitas.has(q.id)))
    .sort(() => Math.random() - 0.5);

  for (const b of blocosComResposta) {
    const conjuntoId = randomUUID();
    conjuntos.push({
      id: conjuntoId,
      periodId: ciclo.id,
      periodFormId: periodForm.id,
      blockId: b.id,
      targetType: b.targetType,
      targetRefId: null,
      // Egresso é ex-aluno: o papel guarda o recorte "aluno" e o curso de origem
      // é o único dado do respondente.
      respondentRole: 'ALUNO',
      respondentCourseId: cursoId,
      anonimo: true,
      submetidoEm: dia,
      // Sem vínculo com ninguém, não há lote a retratar.
      loteId: null,
    });

    for (const q of b.questoes) {
      const v = aceitas.get(q.id);
      if (!v) continue;
      const respostaId = randomUUID();
      respostas.push({
        id: respostaId,
        responseSetId: conjuntoId,
        questionId: q.id,
        valorNumerico: v.numerico ?? null,
        valorTexto: v.texto ?? null,
        valorBooleano: v.booleano ?? null,
        naoSeAplica: false,
      });
      for (const optionId of v.opcoes ?? []) marcacoes.push({ answerId: respostaId, optionId });
    }
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.responseSet.createMany({ data: conjuntos });
      await tx.answer.createMany({ data: respostas });
      if (marcacoes.length > 0) await tx.answerOption.createMany({ data: marcacoes });
      await tx.auditLog.create({
        data: {
          acao: 'EGRESSO_ENVIO',
          entidade: 'EvaluationPeriod',
          entidadeId: ciclo.id,
          dadosDepois: { rede },
        },
      });
    },
    { timeout: 20_000, maxWait: 10_000 },
  );

  redirect(`${TELA}/concluido`);
}
