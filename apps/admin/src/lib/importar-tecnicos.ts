/**
 * Leitura da planilha de técnico-administrativos.
 *
 * Só o que sai de dentro do arquivo: achar as colunas e devolver linhas limpas.
 * Decidir o que fazer com cada linha (criar, pular, recusar) depende do banco e
 * fica na ação.
 *
 * Aceita .xlsx e .csv. O .xls antigo (formato binário do Excel 97–2003, que é o
 * que os relatórios de folha costumam gerar) é recusado com instrução: ler esse
 * formato exigiria uma biblioteca a mais para um arquivo que o próprio Excel
 * converte em dois cliques.
 */
import ExcelJS from 'exceljs';

export type LinhaLida = {
  /** Número da linha na planilha, para a CPA achar o problema lá. */
  linha: number;
  nome: string;
  email: string;
  matricula: string;
};

export type SituacaoLinha = 'novo' | 'ja' | 'inativo' | 'conflito' | 'erro';

export type LinhaAnalisada = LinhaLida & {
  situacao: SituacaoLinha;
  motivo?: string;
};

export const LIMITE_LINHAS = 1000;
export const LIMITE_BYTES = 2 * 1024 * 1024;

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ALIAS = {
  nome: ['nome', 'nomecompleto', 'colaborador', 'funcionario', 'servidor', 'empregado'],
  email: [
    'email',
    'emailinstitucional',
    'emaildeacesso',
    'emailcorporativo',
    'correioeletronico',
    'emailprofissional',
  ],
  matricula: ['matricula', 'matriculainterna', 'codigo', 'registro', 'chapa', 'codigorh'],
} as const;

function celula(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    // Hiperlink (o Excel transforma e-mail digitado em `mailto:`).
    if (typeof o.text === 'string') return o.text.trim();
    if (o.text && typeof o.text === 'object') return celula(o.text as ExcelJS.CellValue);
    if ('result' in o) return celula(o.result as ExcelJS.CellValue);
    if (Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join('').trim();
    }
    return '';
  }
  return String(v).replace(/^mailto:/i, '').trim();
}

/** CSV com aspas, vírgula ou ponto e vírgula (o Excel em português exporta com `;`). */
function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.split(/\r?\n/, 1)[0] ?? '';
  const delimitador =
    (primeira.match(/;/g)?.length ?? 0) >= (primeira.match(/,/g)?.length ?? 0) ? ';' : ',';

  const linhas: string[][] = [];
  let linha: string[] = [];
  let atual = '';
  let aspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        atual += '"';
        i++;
      } else if (c === '"') {
        aspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      aspas = true;
    } else if (c === delimitador) {
      linha.push(atual.trim());
      atual = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(atual.trim());
      linhas.push(linha);
      linha = [];
      atual = '';
    } else {
      atual += c;
    }
  }
  if (atual !== '' || linha.length > 0) {
    linha.push(atual.trim());
    linhas.push(linha);
  }
  return linhas;
}

/** UTF-8 se for válido; senão Windows-1252, que é o que o Excel antigo grava. */
function decodificar(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

async function matrizDoArquivo(bytes: Uint8Array): Promise<string[][]> {
  // .xls antigo (OLE2): assinatura D0 CF 11 E0.
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    throw new Error(
      'Este é um arquivo .xls antigo. Abra no Excel e use Arquivo → Salvar como → Pasta de Trabalho do Excel (.xlsx) ou CSV, e envie de novo.',
    );
  }

  // .xlsx é um zip: assinatura "PK".
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    const planilha = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!planilha) throw new Error('A planilha está vazia.');

    const matriz: string[][] = [];
    planilha.eachRow({ includeEmpty: true }, (row, numero) => {
      const celulas: string[] = [];
      for (let c = 1; c <= Math.max(row.cellCount, 1); c++) celulas.push(celula(row.getCell(c).value));
      matriz[numero - 1] = celulas;
    });
    // Linhas em branco no meio viram undefined no vetor esparso.
    return Array.from(matriz, (l) => l ?? []);
  }

  return lerCsv(decodificar(bytes));
}

/**
 * Lê as linhas de técnicos de um arquivo.
 *
 * O cabeçalho pode não estar na primeira linha (relatórios trazem título e
 * data antes), então se procura nas primeiras 20 por uma linha que tenha uma
 * coluna de nome e uma de e-mail. Sem e-mail não há importação: é o e-mail que
 * abre o acesso do técnico.
 */
export async function lerPlanilhaTecnicos(bytes: Uint8Array): Promise<LinhaLida[]> {
  const matriz = await matrizDoArquivo(bytes);

  let cab = -1;
  let colNome = -1;
  let colEmail = -1;
  let colMatricula = -1;

  for (let r = 0; r < Math.min(matriz.length, 20); r++) {
    const chaves = (matriz[r] ?? []).map(norm);
    const n = chaves.findIndex((k) => (ALIAS.nome as readonly string[]).includes(k));
    const e = chaves.findIndex((k) => (ALIAS.email as readonly string[]).includes(k));
    if (n >= 0 && e >= 0) {
      cab = r;
      colNome = n;
      colEmail = e;
      colMatricula = chaves.findIndex((k) => (ALIAS.matricula as readonly string[]).includes(k));
      break;
    }
  }

  if (cab < 0) {
    const vistas = (matriz.slice(0, 20).flat().filter(Boolean) as string[]).slice(0, 8);
    throw new Error(
      'Não achei as colunas "Nome" e "E-mail" nas primeiras linhas. A planilha precisa ter essas duas ' +
        '(a de matrícula é opcional); o e-mail é o que dá acesso ao técnico.' +
        (vistas.length ? ` Colunas vistas: ${vistas.join(', ')}.` : ''),
    );
  }

  const linhas: LinhaLida[] = [];
  for (let r = cab + 1; r < matriz.length; r++) {
    const l = matriz[r] ?? [];
    const nome = (l[colNome] ?? '').replace(/\s+/g, ' ').trim();
    const email = (l[colEmail] ?? '').trim();
    const matricula = colMatricula >= 0 ? (l[colMatricula] ?? '').trim() : '';
    if (!nome && !email && !matricula) continue;
    linhas.push({ linha: r + 1, nome, email, matricula });
  }

  if (linhas.length === 0) throw new Error('Não há linhas de dados abaixo do cabeçalho.');
  if (linhas.length > LIMITE_LINHAS) {
    throw new Error(`A planilha tem ${linhas.length} linhas; o limite é ${LIMITE_LINHAS} por importação.`);
  }
  return linhas;
}
