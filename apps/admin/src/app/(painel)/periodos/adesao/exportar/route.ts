/**
 * Exportação da adesão de um ciclo, em Excel ou PDF.
 *
 *   /periodos/adesao/exportar?ciclo=<id>&formato=xlsx
 *   /periodos/adesao/exportar?ciclo=<id>&formato=pdf
 *
 * Exporta o que a tela de adesão mostra — TAREFAS (quem recebeu e quem enviou),
 * nunca respostas. Por isso pode nomear curso e turma: não há aqui nada do que
 * foi respondido, e portanto nada que ligue uma pessoa a uma resposta.
 *
 * O Excel leva três abas (turmas, cursos, resumo), com cabeçalho congelado e
 * filtro, para a CPA ordenar e cobrar por onde quiser. O PDF é a lista de
 * turmas, da menor adesão para a maior, pronta para imprimir ou mandar.
 *
 * Quem foi retirado do ciclo não conta (as consultas de `lib/adesao` já o
 * excluem), então o número exportado é o mesmo da tela.
 */
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import {
  adesaoPorCurso,
  adesaoPorTurma,
  resumoDeAdesao,
  type FatiaDeAdesao,
  type ResumoDeAdesao,
} from '@/lib/adesao';

export const dynamic = 'force-dynamic';

const AZUL = '1A2D42';
const TEAL = '00BFB2';
const CINZA = 'F1F5F9';

const fracao = (f: FatiaDeAdesao) => (f.tarefas > 0 ? f.concluidas / f.tarefas : 0);
const naoAbriram = (f: FatiaDeAdesao) => f.tarefas - f.concluidas - f.emAndamento;
const numero = (n: number) => new Intl.NumberFormat('pt-BR').format(n);
const percentual = (f: FatiaDeAdesao) => Math.round(fracao(f) * 100);

type Ciclo = { nome: string; ano: number; status: string };

const STATUS: Record<string, string> = {
  RASCUNHO: 'rascunho',
  AGENDADO: 'agendado',
  ABERTO: 'aberto',
  ENCERRADO: 'encerrado',
};

/** Data e hora de Brasília, que é como a CPA lê o relatório. */
function agora(): string {
  return new Date().toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

function nomeDoArquivo(extensao: string): string {
  const dia = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return `adesao-turmas-${dia}.${extensao}`;
}

// ------------------------------------------------------------------- Excel

async function excel(
  ciclo: Ciclo,
  resumo: ResumoDeAdesao,
  cursos: FatiaDeAdesao[],
  turmas: FatiaDeAdesao[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Insted — Avaliação Institucional';
  wb.created = new Date();

  /** Planilha de tabela: cabeçalho em destaque, congelado, com filtro. */
  function tabela(
    nome: string,
    colunas: { titulo: string; largura: number; formato?: string }[],
    linhas: (string | number)[][],
  ) {
    const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = colunas.map((c) => ({ header: c.titulo, width: c.largura }));

    const cab = ws.getRow(1);
    cab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cab.alignment = { vertical: 'middle' };
    cab.height = 22;
    cab.eachCell((cel) => {
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${AZUL}` } };
    });

    for (const l of linhas) ws.addRow(l);

    // As cinco últimas colunas são sempre os números: alinham à direita.
    colunas.forEach((c, i) => {
      if (c.formato) ws.getColumn(i + 1).numFmt = c.formato;
      if (i >= colunas.length - 5) ws.getColumn(i + 1).alignment = { horizontal: 'right' };
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunas.length } };
    return ws;
  }

  const metricas = (f: FatiaDeAdesao) => [
    f.tarefas,
    f.concluidas,
    f.emAndamento,
    naoAbriram(f),
    fracao(f),
  ];
  const colunasDeNumeros = [
    { titulo: 'Respondentes', largura: 14 },
    { titulo: 'Enviaram', largura: 11 },
    { titulo: 'Começaram', largura: 12 },
    { titulo: 'Nem abriram', largura: 13 },
    { titulo: 'Adesão', largura: 10, formato: '0%' },
  ];

  tabela(
    'Turmas',
    [
      { titulo: 'Turma', largura: 46 },
      { titulo: 'Curso', largura: 38 },
      ...colunasDeNumeros,
    ],
    turmas.map((t) => [t.rotulo, t.detalhe ?? '', ...metricas(t)]),
  );

  tabela(
    'Cursos',
    [
      { titulo: 'Curso', largura: 46 },
      { titulo: 'Código', largura: 14 },
      ...colunasDeNumeros,
    ],
    cursos.map((c) => [c.rotulo, c.detalhe ?? '', ...metricas(c)]),
  );

  const ws = wb.addWorksheet('Resumo');
  ws.columns = [{ width: 26 }, { width: 44 }];
  const dados: [string, string | number][] = [
    ['Ciclo', ciclo.nome],
    ['Situação', STATUS[ciclo.status] ?? ciclo.status.toLowerCase()],
    ['Gerado em', agora()],
    ['Respondentes', resumo.tarefas],
    ['Enviaram', resumo.concluidas],
    ['Começaram', resumo.emAndamento],
    ['Nem abriram', resumo.pendentes],
    ['Adesão', resumo.tarefas > 0 ? resumo.concluidas / resumo.tarefas : 0],
  ];
  dados.forEach(([k, v], i) => {
    const r = ws.addRow([k, v]);
    r.getCell(1).font = { bold: true, color: { argb: `FF${AZUL}` } };
    r.getCell(2).alignment = { horizontal: 'left' };
    if (i === dados.length - 1) r.getCell(2).numFmt = '0%';
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// --------------------------------------------------------------------- PDF

const MARGEM = 40;
// A4 em paisagem: nome de curso e de turma são longos, e a tabela em retrato
// os cortava justo onde diferenciam uma turma da outra.
const LARGURA = 841.89 - MARGEM * 2;
const ALTURA_LINHA = 17;
const COLUNAS = [
  { titulo: 'Turma', x: 0, w: 250 },
  { titulo: 'Curso', x: 250, w: 200 },
  { titulo: 'Resp.', x: 450, w: 50, direita: true },
  { titulo: 'Enviaram', x: 500, w: 62, direita: true },
  { titulo: 'Faltam', x: 562, w: 52, direita: true },
  { titulo: 'Adesão', x: 614, w: LARGURA - 614 },
];

/**
 * Corta o texto para caber na largura, com reticências.
 *
 * Existe porque a opção `ellipsis` do pdfkit só age quando há altura limitada
 * E quebra de linha ligada — com `lineBreak: false` ela não corta nada, e o nome
 * longo de uma turma escorre para a linha de baixo, por cima da próxima.
 * A fonte e o tamanho precisam estar definidos antes, que é com o que se mede.
 */
function caber(doc: PDFKit.PDFDocument, texto: string, largura: number): string {
  if (doc.widthOfString(texto) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && doc.widthOfString(`${t}…`) > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function pdf(
  ciclo: Ciclo,
  resumo: ResumoDeAdesao,
  turmas: FatiaDeAdesao[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: MARGEM,
      bufferPages: true,
      info: { Title: `Adesão por turma — ${ciclo.nome}`, Author: 'Insted — Avaliação Institucional' },
    });
    const partes: Buffer[] = [];
    doc.on('data', (p: Buffer) => partes.push(p));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    // ---- cabeçalho do documento
    doc.fillColor(`#${AZUL}`).font('Helvetica-Bold').fontSize(18).text('Adesão por turma', MARGEM, MARGEM);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#64748B')
      .text(`${ciclo.nome} · ciclo ${STATUS[ciclo.status] ?? ciclo.status.toLowerCase()} · gerado em ${agora()}`);
    doc.moveDown(0.5);
    doc
      .fillColor(`#${AZUL}`)
      .fontSize(10.5)
      .text(
        `Adesão geral ${resumo.percentual}% · ${numero(resumo.concluidas)} de ${numero(resumo.tarefas)} ` +
          `respondentes enviaram · ${numero(resumo.emAndamento)} começaram · ${numero(resumo.pendentes)} nem abriram.`,
      );
    doc
      .fillColor('#64748B')
      .fontSize(8.5)
      .text(`${numero(turmas.length)} turmas, da menor adesão para a maior. É por onde começa a cobrança.`);

    let y = doc.y + 12;

    const cabecalhoDaTabela = () => {
      doc.rect(MARGEM, y, LARGURA, ALTURA_LINHA + 3).fill(`#${AZUL}`);
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(8);
      for (const c of COLUNAS) {
        doc.text(c.titulo.toUpperCase(), MARGEM + c.x + 4, y + 6, {
          width: c.w - 8,
          align: c.direita ? 'right' : 'left',
          lineBreak: false,
        });
      }
      y += ALTURA_LINHA + 3;
    };
    cabecalhoDaTabela();

    const limiteDaPagina = () => doc.page.height - MARGEM - 24;

    turmas.forEach((t, i) => {
      if (y + ALTURA_LINHA > limiteDaPagina()) {
        doc.addPage();
        y = MARGEM;
        cabecalhoDaTabela();
      }

      if (i % 2 === 1) doc.rect(MARGEM, y, LARGURA, ALTURA_LINHA).fill(`#${CINZA}`);

      const pct = percentual(t);
      const faltam = t.tarefas - t.concluidas;
      doc.font('Helvetica').fontSize(8.5).fillColor(`#${AZUL}`);
      const texto = (s: string, c: (typeof COLUNAS)[number], cor?: string) => {
        if (cor) doc.fillColor(cor);
        doc.text(caber(doc, s, c.w - 8), MARGEM + c.x + 4, y + 5, {
          width: c.w - 8,
          align: c.direita ? 'right' : 'left',
          lineBreak: false,
        });
        doc.fillColor(`#${AZUL}`);
      };
      texto(t.rotulo, COLUNAS[0]);
      texto(t.detalhe ?? '', COLUNAS[1], '#64748B');
      texto(numero(t.tarefas), COLUNAS[2]);
      texto(numero(t.concluidas), COLUNAS[3]);
      texto(numero(faltam), COLUNAS[4]);

      // Barra de adesão, com o percentual ao lado.
      const barra = COLUNAS[5];
      const bx = MARGEM + barra.x + 4;
      const bw = barra.w - 40;
      doc.roundedRect(bx, y + 6, bw, 5, 2).fill('#E2E8F0');
      if (pct > 0) doc.roundedRect(bx, y + 6, Math.max(3, (bw * pct) / 100), 5, 2).fill(`#${TEAL}`);
      doc
        .font('Helvetica')
        .fontSize(8.5)
        .fillColor(pct === 0 ? '#FF8200' : `#${AZUL}`)
        .text(`${pct}%`, bx + bw + 4, y + 5, { width: 30, align: 'right', lineBreak: false });

      y += ALTURA_LINHA;
    });

    // ---- rodapé com paginação
    // A margem inferior zerada é de propósito: escrever abaixo dela faria o
    // pdfkit abrir uma página nova só para o rodapé.
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);
      doc.page.margins.bottom = 0;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#94A3B8')
        .text(
          `Insted · Avaliação Institucional   |   Página ${i + 1} de ${paginas.count}`,
          MARGEM,
          doc.page.height - 30,
          { width: LARGURA, align: 'center', lineBreak: false },
        );
    }

    doc.end();
  });
}

// ------------------------------------------------------------------- rota

export async function GET(req: NextRequest) {
  await exigirPainel();

  const periodId = req.nextUrl.searchParams.get('ciclo') ?? '';
  const formato = req.nextUrl.searchParams.get('formato') ?? '';
  if (formato !== 'xlsx' && formato !== 'pdf') {
    return new NextResponse('Formato desconhecido.', { status: 400 });
  }

  const ciclo = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
    select: { nome: true, ano: true, status: true },
  });
  if (!ciclo) return new NextResponse('Ciclo não encontrado.', { status: 404 });

  const [resumo, cursos, turmas] = await Promise.all([
    resumoDeAdesao(periodId),
    adesaoPorCurso(periodId),
    adesaoPorTurma(periodId),
  ]);

  const [corpo, tipo] =
    formato === 'xlsx'
      ? [
          await excel(ciclo, resumo, cursos, turmas),
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]
      : [await pdf(ciclo, resumo, turmas), 'application/pdf'];

  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      'content-type': tipo,
      'content-disposition': `attachment; filename="${nomeDoArquivo(formato)}"`,
      'cache-control': 'no-store',
    },
  });
}
