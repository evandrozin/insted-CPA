/**
 * Formato dos elementos devolvidos pela API do JACAD.
 *
 * Só os campos que a integração realmente lê estão tipados — o payload
 * completo fica em `raw` no staging. Tudo é opcional porque a API omite
 * campos conforme o perfil do usuário de integração.
 */

/**
 * Organização (mantenedora / escola).
 *
 * O campo é `idOrganizacao`, NÃO `id` — e a organização principal do Insted
 * tem id **0**. Qualquer checagem `if (!idOrganizacao)` a descarta em silêncio;
 * compare sempre com `== null` / `undefined`.
 */
export type ElOrganizacao = {
  idOrganizacao: number;
  descricao?: string;
  nomeFantasia?: string | null;
  cnpj?: string;
  status?: string;
};

export type ElPeriodoLetivo = {
  idPeriodoLetivo: number;
  descricao?: string;
  descricaoEspecial?: string;
  ano?: number;
  semestre?: number;
  situacao?: string;
  tipo?: string;
  periodoAtual?: boolean;
  consolidado?: boolean;
  dataInicio?: string;
  dataTermino?: string;
  idOrg?: number;
  orgDescricao?: string;
};

export type ElCurso = {
  idCursoBase: number;
  nomeImpressao?: string;
  nomeReduzido?: string;
  codigoCurso?: string;
  modalidade?: string;
  grau?: string;
  idOrg?: number;
};

/** Turmas usam o prefixo `turma*` em quase todos os campos. */
export type ElTurma = {
  idTurma: number;
  turmaNome?: string;
  turmaNomeRed?: string;
  turmaIdCurso?: number;
  turmaCurso?: string;
  turmaIdMatriz?: number;
  turmaMatriz?: string;
  turmaIdPeriodoLetivo?: number;
  turmaPeriodoLetivo?: string;
  turmaIdUnidadeFisica?: number;
  turmaUnidadeFisica?: string;
  turmaTurno?: string;
  turmaPeriodoItem?: string;
  turmaStatus?: string;
  turmaDataInicio?: string;
  turmaDataFim?: string;
  turmaQtdeDisciplina?: number;
  idOrg?: number;
  orgDescricao?: string;
};

export type ElMatricula = {
  idMatricula: number;
  idTurma?: number;
  idPeriodoLetivo?: number;
  idAluno?: number;
  idPerfilAluno?: number;
  idAlunoCursoIngresso?: number;
  aluno?: string;
  ra?: string;
  raEstadual?: string;
  periodoLetivo?: string;
  idCursoBase?: number;
  curso?: string;
  turma?: string;
  idCursoMatriz?: number;
  matriz?: string;
  status?: string;
  alunoEmail?: string;
  alunoEmailInstitucional?: string;
  dataMatricula?: string;
  dataAtivacao?: string;
  dataTrancamento?: string;
  idUnidadeFisica?: number;
  unidadeFisica?: string;
  idOrg?: number;
  organizacao?: string;
};

/**
 * Disciplina cursada por uma matrícula.
 *
 * `professor` é o NOME em texto livre — a API não devolve um identificador de
 * docente aqui. Ver docs/05-integracao-jacad.md.
 */
export type ElMatriculaDisciplina = {
  idMatriculaDisciplina: number;
  idCursoBase?: number;
  disciplina?: string;
  professor?: string;
  turma?: string;
  modulo?: string;
  moduloRed?: string;
  quantAulas?: number;
  quantFaltas?: number;
  frequencia?: number;
  mediaFinal?: number;
  notaFinal?: number;
  statusMatriculaDisciplina?: string;
  statusMatricula?: string;
};
