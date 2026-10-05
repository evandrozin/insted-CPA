/**
 * Exportação das respostas de um ciclo, em CSV.
 *
 *   /periodos/<id>/resultados/csv?formato=longo
 *   /periodos/<id>/resultados/csv?formato=largo
 *   /periodos/<id>/resultados/csv?formato=comentarios
 *
 * Exporta O QUE foi respondido. A lista de QUEM respondeu é outra rota
 * (`respondentes/csv`), e não há chave ligando as duas — é essa separação que
 * sustenta o anonimato. Nada aqui pode reconstruí-la:
 *
 * - `loteId` existe no banco e junta os cards de um mesmo envio (serve para
 *   retratar um envio feito por engano). Ele NÃO entra em nenhum formato, nem
 *   como coluna técnica: agrupar por ele é remontar a pessoa.
 * - o carimbo sai como dia, que é como está gravado.
 *
 * Três formatos porque são três leituras diferentes:
 *
 * - `longo`: uma linha por resposta. É o que alimenta tabela dinâmica e o que
 *   aguenta múltipla escolha sem inventar coluna.
 * - `largo`: uma linha por card respondido, uma coluna por pergunta. Parecido
 *   com a planilha do Google Forms, para quem só quer olhar.
 * - `comentarios`: só texto livre, em arquivo separado. O número circula; o
 *   texto que pode identificar alguém, não deveria circular junto.
 *
 * Lê em lotes e escreve em fluxo: um ciclo cheio são ~1.700 alunos × ~13
 * cards, com mais de cem mil respostas. Montar tudo em memória antes de
 * responder derrubaria a função.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import type { Prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/** Quantos cards por ida ao banco. */
const LOTE = 500;

type Formato = 'longo' | 'largo' | 'comentarios';

/**
 * O que cada card respondido traz para o arquivo.
 *
 * Fora da consulta, e com o tipo do resultado declarado logo abaixo, porque a
 * paginação alimenta o filtro com um id tirado do resultado anterior: deixar o
 * TypeScript inferir tudo fecha um ciclo e ele desiste, devolvendo `any`.
 *
 * Note o que NÃO está aqui: `loteId`. Ele junta os cards de um mesmo envio, e
 * é exatamente por isso que não pode sair numa planilha.
 */
const SELECAO = {
  id: true,
  blockId: true,
  targetType: true,
  submetidoEm: true,
  respondentTurno: true,
  respondentPeriodo: true,
  periodForm: { select: { form: { select: { nome: true } } } },
  teacher: { select: { nome: true } },
  subject: { select: { nome: true } },
  department: { select: { nome: true } },
  course: { select: { nome: true } },
  respondentCourse: { select: { nome: true } },
  respondentClass: { select: { nome: true } },
  answers: {
    select: {
      questionId: true,
      valorNumerico: true,
      valorTexto: true,
      valorBooleano: true,
      naoSeAplica: true,
      opcoes: { select: { option: { select: { rotulo: true } } } },
    },
  },
} satisfies Prisma.ResponseSetSelect;

type Conjunto = Prisma.ResponseSetGetPayload<{ select: typeof SELECAO }>;

function campo(v: string | number | null | undefined): string {
  const t = String(v ?? '').replace(/"/g, '""');
  return `"${t}"`;
}

const linha = (celulas: (string | number | null | undefined)[]) =>
  celulas.map(campo).join(';') + '\r\n';

const dia = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

const TURNO: Record<string, string> = {
  MATUTINO: 'Matutino',
  VESPERTINO: 'Vespertino',
  NOTURNO: 'Noturno',
  INTEGRAL: 'Integral',
};

const ALVO: Record<string, string> = {
  INSTITUICAO: 'Instituição',
  INFRAESTRUTURA: 'Infraestrutura',
  DEPARTAMENTO: 'Setor',
  COORDENACAO: 'Coordenação',
  CURSO: 'Curso',
  DISCIPLINA: 'Disciplina',
  PROFESSOR_DISCIPLINA: 'Professor',
  AUTOAVALIACAO: 'Autoavaliação',
};

type ConfigEscala = { labels?: Record<string, string> };

/** O que o respondente marcou, em texto legível. */
function rotuloDaResposta(
  a: {
    valorNumerico: number | null;
    valorTexto: string | null;
    valorBooleano: boolean | null;
    naoSeAplica: boolean;
    opcoes: { option: { rotulo: string } }[];
  },
  config: unknown,
): string {
  if (a.naoSeAplica) return 'Não se aplica';
  if (a.opcoes.length > 0) return a.opcoes.map((o) => o.option.rotulo).join(' | ');
  if (a.valorBooleano !== null) return a.valorBooleano ? 'Sim' : 'Não';
  if (a.valorNumerico !== null) {
    const labels = (config as ConfigEscala | null)?.labels;
    return labels?.[String(a.valorNumerico)] ?? String(a.valorNumerico);
  }
  return a.valorTexto ?? '';
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await exigirPainel();
  const { id } = await params;

  const formato = (req.nextUrl.searchParams.get('formato') ?? 'longo') as Formato;
  if (!['longo', 'largo', 'comentarios'].includes(formato)) {
    return new NextResponse('Formato desconhecido.', { status: 400 });
  }

  const ciclo = await prisma.evaluationPeriod.findUnique({
    where: { id },
    select: { nome: true, ano: true },
  });
  if (!ciclo) return new NextResponse('Ciclo não encontrado.', { status: 404 });

  // Mapa das perguntas do ciclo: o formato largo precisa das colunas antes de
  // ler qualquer resposta, e o longo precisa do rótulo da escala.
  const formularios = await prisma.periodForm.findMany({
    where: { periodId: id },
    select: {
      form: {
        select: {
          nome: true,
          blocos: {
            orderBy: { ordem: 'asc' },
            select: {
              id: true,
              titulo: true,
              ordem: true,
              questoes: {
                orderBy: { ordem: 'asc' },
                select: { id: true, enunciado: true, tipo: true, ordem: true, config: true },
              },
            },
          },
        },
      },
    },
  });

  type Pergunta = {
    id: string;
    enunciado: string;
    tipo: string;
    config: unknown;
    bloco: string;
    rotulo: string;
  };

  const perguntas = new Map<string, Pergunta>();
  const blocos = new Map<string, string>();
  const colunas: Pergunta[] = [];

  for (const pf of formularios) {
    for (const b of pf.form.blocos) {
      blocos.set(b.id, b.titulo);
      for (const q of b.questoes) {
        if (perguntas.has(q.id)) continue;
        const p: Pergunta = {
          id: q.id,
          enunciado: q.enunciado,
          tipo: q.tipo,
          config: q.config,
          bloco: b.titulo,
          rotulo: `${b.ordem + 1}.${q.ordem + 1} ${q.enunciado}`,
        };
        perguntas.set(q.id, p);
        colunas.push(p);
      }
    }
  }

  const texto = (p: Pergunta | undefined) => p?.tipo === 'TEXTO_LIVRE';

  const cabecalho =
    formato === 'longo'
      ? linha([
          'Ciclo',
          'Formulário',
          'Bloco',
          'Tipo de alvo',
          'Alvo avaliado',
          'Disciplina',
          'Nº',
          'Pergunta',
          'Tipo',
          'Valor',
          'Resposta',
          'Não se aplica',
          'Enviado em',
          'Curso do respondente',
          'Turma',
          'Turno',
          'Semestre',
        ])
      : formato === 'comentarios'
        ? linha([
            'Ciclo',
            'Bloco',
            'Tipo de alvo',
            'Alvo avaliado',
            'Disciplina',
            'Pergunta',
            'Comentário',
            'Enviado em',
            'Curso do respondente',
            'Turma',
          ])
        : linha([
            'Ciclo',
            'Bloco',
            'Tipo de alvo',
            'Alvo avaliado',
            'Disciplina',
            'Enviado em',
            'Curso do respondente',
            'Turma',
            'Turno',
            'Semestre',
            ...colunas.map((c) => c.rotulo),
          ]);

  const codificador = new TextEncoder();

  const fluxo = new ReadableStream<Uint8Array>({
    async start(controle) {
      // BOM: sem ele o Excel em português abre o arquivo com acento quebrado.
      controle.enqueue(codificador.encode('﻿' + cabecalho));

      let cursor: string | null = null;

      for (;;) {
        // Paginação por "id maior que o último", em vez de cursor com skip: o
        // banco usa a chave primária direto.
        //
        // A cópia em `depois` não é enfeite: `cursor` recebe, mais abaixo, um
        // valor tirado do próprio resultado da consulta, e usá-lo aqui faria o
        // TypeScript inferir o tipo do resultado a partir dele mesmo.
        const depois: string | null = cursor;

        const conjuntos: Conjunto[] = await prisma.responseSet.findMany({
          where: depois === null ? { periodId: id } : { periodId: id, id: { gt: depois } },
          orderBy: { id: 'asc' },
          take: LOTE,
          select: SELECAO,
        });

        if (conjuntos.length === 0) break;
        cursor = conjuntos[conjuntos.length - 1].id;

        let pedaco = '';

        for (const c of conjuntos) {
          const alvo =
            c.teacher?.nome ??
            c.department?.nome ??
            c.course?.nome ??
            c.subject?.nome ??
            ALVO[c.targetType] ??
            c.targetType;

          const comuns = [
            ciclo.nome,
            ALVO[c.targetType] ?? c.targetType,
            alvo,
            c.subject?.nome ?? '',
            dia(c.submetidoEm),
            c.respondentCourse?.nome ?? '',
            c.respondentClass?.nome ?? '',
            c.respondentTurno ? (TURNO[c.respondentTurno] ?? c.respondentTurno) : '',
            c.respondentPeriodo ?? '',
          ];

          if (formato === 'largo') {
            const porPergunta = new Map(c.answers.map((a) => [a.questionId, a]));
            pedaco += linha([
              comuns[0],
              blocos.get(c.blockId) ?? '',
              ...comuns.slice(1),
              ...colunas.map((p) => {
                const a = porPergunta.get(p.id);
                return a ? rotuloDaResposta(a, p.config) : '';
              }),
            ]);
            continue;
          }

          for (const a of c.answers) {
            const p = perguntas.get(a.questionId);

            if (formato === 'comentarios') {
              if (!texto(p) || !a.valorTexto?.trim()) continue;
              pedaco += linha([
                ciclo.nome,
                p?.bloco ?? '',
                ALVO[c.targetType] ?? c.targetType,
                alvo,
                c.subject?.nome ?? '',
                p?.enunciado ?? '',
                a.valorTexto.trim(),
                dia(c.submetidoEm),
                c.respondentCourse?.nome ?? '',
                c.respondentClass?.nome ?? '',
              ]);
              continue;
            }

            // Formato longo: o texto livre vai no arquivo de comentários.
            if (texto(p)) continue;

            pedaco += linha([
              ciclo.nome,
              c.periodForm.form.nome,
              p?.bloco ?? '',
              ALVO[c.targetType] ?? c.targetType,
              alvo,
              c.subject?.nome ?? '',
              p ? p.rotulo.split(' ')[0] : '',
              p?.enunciado ?? '',
              p?.tipo ?? '',
              a.valorNumerico ?? '',
              rotuloDaResposta(a, p?.config),
              a.naoSeAplica ? 'Sim' : '',
              dia(c.submetidoEm),
              c.respondentCourse?.nome ?? '',
              c.respondentClass?.nome ?? '',
              c.respondentTurno ? (TURNO[c.respondentTurno] ?? c.respondentTurno) : '',
              c.respondentPeriodo ?? '',
            ]);
          }
        }

        controle.enqueue(codificador.encode(pedaco));
        if (conjuntos.length < LOTE) break;
      }

      controle.close();
    },
  });

  const arquivo = `respostas-${ciclo.ano}-${formato}.csv`;

  return new NextResponse(fluxo, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${arquivo}"`,
      'cache-control': 'no-store',
    },
  });
}
