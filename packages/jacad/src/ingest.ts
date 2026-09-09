/**
 * Ingestão JACAD → tabelas de staging (jacad_*).
 *
 * Espelha `MatriculaIngestService.php` do Insted Hub Digital. Nada aqui toca
 * nas entidades do CPA: a transformação acontece depois, em `promover.ts`.
 *
 * Ordem de dependência (respeite-a):
 *   períodos letivos → cursos → turmas → matrículas → matrícula-disciplina
 */
import type { PrismaClient } from '@prisma/client';
import { JacadClient, dormir } from './client.js';
import type {
  ElOrganizacao,
  ElPeriodoLetivo,
  ElCurso,
  ElTurma,
  ElMatricula,
  ElMatriculaDisciplina,
} from './tipos.js';

type Progresso = (msg: string) => void;

const LOTE = 100;
const STATUS_TURMA = ['ATIVA', 'AGUARDANDO', 'ENCERRADA', 'CANCELADA'] as const;

export class JacadIngest {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly jacad: JacadClient,
    private readonly onProgresso: Progresso = () => {},
  ) {}

  private log(msg: string) {
    this.onProgresso(msg);
  }

  /** Datas do JACAD vêm em formatos variados; o que não parseia vira null. */
  private data(v: unknown): Date | null {
    if (!v || typeof v !== 'string') return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** "3º Semestre" / "3o Periodo" -> 3 */
  private periodoNumero(v: unknown): number | null {
    if (typeof v !== 'string') return null;
    const m = v.match(/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  private async organizacoes(): Promise<ElOrganizacao[]> {
    const resp = await this.jacad.get<{ elements: ElOrganizacao[] }>(
      '/api/v1/basicos/organizacoes',
      { pageSize: 100 },
    );
    return resp?.elements ?? [];
  }

  // ------------------------------------------------------------ 1. períodos
  async sincronizarPeriodosLetivos(): Promise<number> {
    let total = 0;

    for (const org of await this.organizacoes()) {
      for await (const { elements } of this.jacad.paginar<ElPeriodoLetivo>(
        '/api/v1/academico/periodos-letivos/',
        { idOrg: org.idOrganizacao },
      )) {
        await this.prisma.$transaction(
          elements.map((p) =>
            this.prisma.jacadPeriodoLetivo.upsert({
              where: { idPeriodoLetivo: p.idPeriodoLetivo },
              create: {
                idPeriodoLetivo: p.idPeriodoLetivo,
                descricao: p.descricao ?? null,
                ano: p.ano ?? null,
                semestre: p.semestre ?? null,
                idOrg: p.idOrg ?? org.idOrganizacao,
                orgDescricao: p.orgDescricao ?? org.descricao ?? null,
                raw: p as object,
              },
              update: {
                descricao: p.descricao ?? null,
                ano: p.ano ?? null,
                semestre: p.semestre ?? null,
                idOrg: p.idOrg ?? org.idOrganizacao,
                orgDescricao: p.orgDescricao ?? org.descricao ?? null,
                raw: p as object,
                sincronizadoEm: new Date(),
              },
            }),
          ),
        );
        total += elements.length;
      }
      this.log(`  org ${org.idOrganizacao} (${org.descricao ?? '—'}): períodos processados`);
    }

    this.log(`Períodos letivos sincronizados: ${total}`);
    return total;
  }

  // -------------------------------------------------------------- 2. cursos
  async sincronizarCursos(): Promise<number> {
    let total = 0;

    for await (const { elements, pagina, totalPaginas } of this.jacad.paginar<ElCurso>(
      '/api/v1/academico/cursos-base/',
    )) {
      await this.prisma.$transaction(
        elements.map((c) => {
          const dados = {
            nomeImpressao: c.nomeImpressao ?? null,
            nomeReduzido: c.nomeReduzido ?? null,
            codigoCurso: c.codigoCurso ?? null,
            modalidade: c.modalidade ?? null,
            grau: c.grau ?? null,
            idOrg: c.idOrg ?? null,
            raw: c as object,
          };
          return this.prisma.jacadCurso.upsert({
            where: { idCursoBase: c.idCursoBase },
            create: { idCursoBase: c.idCursoBase, ...dados },
            update: { ...dados, sincronizadoEm: new Date() },
          });
        }),
      );
      total += elements.length;
      this.log(`  cursos: página ${pagina + 1}/${totalPaginas} (+${elements.length})`);
    }

    this.log(`Cursos sincronizados: ${total}`);
    return total;
  }

  // -------------------------------------------------------------- 3. turmas
  /**
   * Turmas são consultadas por período E por status: a API exige `turmaStatus`
   * e não aceita "todos". Quatro varreduras por período, portanto.
   */
  async sincronizarTurmas(ano?: number): Promise<number> {
    const periodos = await this.prisma.jacadPeriodoLetivo.findMany({
      where: ano ? { ano } : undefined,
      orderBy: [{ ano: 'asc' }, { semestre: 'asc' }],
    });

    if (periodos.length === 0) {
      throw new Error('Nenhum período letivo em staging. Rode o recurso "periodos" antes.');
    }

    let total = 0;

    for (const periodo of periodos) {
      for (const status of STATUS_TURMA) {
        for await (const { elements } of this.jacad.paginar<ElTurma>('/api/v1/academico/turmas', {
          turmaIdPeriodoLetivo: periodo.idPeriodoLetivo,
          turmaStatus: status,
        })) {
          await this.prisma.$transaction(
            elements.map((t) => {
              const dados = {
                nome: t.turmaNome ?? null,
                nomeReduzido: t.turmaNomeRed ?? null,
                idCurso: t.turmaIdCurso ?? null,
                curso: t.turmaCurso ?? null,
                idMatriz: t.turmaIdMatriz ?? null,
                matriz: t.turmaMatriz ?? null,
                idPeriodoLetivo: t.turmaIdPeriodoLetivo ?? periodo.idPeriodoLetivo,
                periodoLetivo: t.turmaPeriodoLetivo ?? null,
                idUnidadeFisica: t.turmaIdUnidadeFisica ?? null,
                unidadeFisica: t.turmaUnidadeFisica ?? null,
                turno: t.turmaTurno ?? null,
                periodoItem: t.turmaPeriodoItem ?? null,
                periodoNumero: this.periodoNumero(t.turmaPeriodoItem),
                status: t.turmaStatus ?? status,
                idOrg: t.idOrg ?? null,
                dataInicio: this.data(t.turmaDataInicio),
                dataFim: this.data(t.turmaDataFim),
                qtdeDisciplina: t.turmaQtdeDisciplina ?? null,
                raw: t as object,
              };
              return this.prisma.jacadTurma.upsert({
                where: { idTurma: t.idTurma },
                create: { idTurma: t.idTurma, ...dados },
                update: { ...dados, sincronizadoEm: new Date() },
              });
            }),
          );
          total += elements.length;
        }
      }
      this.log(`  período ${periodo.idPeriodoLetivo} (${periodo.descricao ?? '—'}): turmas ok`);
    }

    this.log(`Turmas sincronizadas: ${total}`);
    return total;
  }

  // --------------------------------------------- 4. matrículas (= os alunos)
  async sincronizarMatriculas(idPeriodoLetivo: number): Promise<number> {
    let total = 0;

    for await (const { elements, pagina, totalPaginas } of this.jacad.paginar<ElMatricula>(
      '/api/v1/academico/matriculas',
      { idPeriodoLetivo },
    )) {
      await this.prisma.$transaction(
        elements.map((m) => {
          const dados = {
            idTurma: m.idTurma ?? null,
            idPeriodoLetivo: m.idPeriodoLetivo ?? idPeriodoLetivo,
            idAluno: m.idAluno ?? null,
            idPerfilAluno: m.idPerfilAluno ?? null,
            idAlunoCursoIngresso: m.idAlunoCursoIngresso ?? null,
            aluno: m.aluno ?? null,
            ra: m.ra ?? null,
            alunoEmail: m.alunoEmail ?? null,
            alunoEmailInstitucional: m.alunoEmailInstitucional ?? null,
            idCursoBase: m.idCursoBase ?? null,
            curso: m.curso ?? null,
            turma: m.turma ?? null,
            idCursoMatriz: m.idCursoMatriz ?? null,
            matriz: m.matriz ?? null,
            status: m.status ?? null,
            idUnidadeFisica: m.idUnidadeFisica ?? null,
            unidadeFisica: m.unidadeFisica ?? null,
            idOrg: m.idOrg ?? null,
            organizacao: m.organizacao ?? null,
            dataMatricula: this.data(m.dataMatricula),
            dataAtivacao: this.data(m.dataAtivacao),
            dataTrancamento: this.data(m.dataTrancamento),
            raw: m as object,
          };
          return this.prisma.jacadMatricula.upsert({
            where: { idMatricula: m.idMatricula },
            create: { idMatricula: m.idMatricula, ...dados },
            update: { ...dados, sincronizadoEm: new Date() },
          });
        }),
      );
      total += elements.length;
      this.log(
        `  período ${idPeriodoLetivo}: página ${pagina + 1}/${totalPaginas} (+${elements.length} | total ${total})`,
      );
    }

    this.log(`Matrículas sincronizadas (período ${idPeriodoLetivo}): ${total}`);
    return total;
  }

  // ------------------------------ 5. disciplinas por matrícula (+ professor)
  /**
   * UMA chamada por matrícula — é o passo lento da integração (o Hub avisa o
   * mesmo). Com 2.000 alunos e 150ms de pausa, conte ~5 minutos por período.
   *
   * Rode de uma máquina com IP liberado no JACAD.
   */
  async sincronizarMatriculaDisciplinas(
    idPeriodoLetivo: number,
    idCursoBase?: number,
  ): Promise<number> {
    const matriculas = await this.prisma.jacadMatricula.findMany({
      where: { idPeriodoLetivo, ...(idCursoBase ? { idCursoBase } : {}) },
      select: {
        idMatricula: true,
        idAluno: true,
        idPerfilAluno: true,
        idPeriodoLetivo: true,
        idCursoBase: true,
      },
    });

    if (matriculas.length === 0) {
      throw new Error(
        `Nenhuma matrícula em staging para o período ${idPeriodoLetivo}. Rode "matriculas" antes.`,
      );
    }

    let total = 0;
    let i = 0;

    for (const m of matriculas) {
      const resp = await this.jacad.get<{ elements: ElMatriculaDisciplina[] }>(
        '/api/v1/academico/matricula-disciplina',
        { idMatricula: m.idMatricula, pageSize: 100 },
      );

      const linhas = resp?.elements ?? [];
      if (linhas.length > 0) {
        await this.prisma.$transaction(
          linhas.map((d) => {
            const dados = {
              idMatricula: m.idMatricula,
              idAluno: m.idAluno,
              idPerfilAluno: m.idPerfilAluno,
              idPeriodoLetivo: m.idPeriodoLetivo,
              idCursoBase: d.idCursoBase ?? m.idCursoBase,
              disciplina: texto(d.disciplina),
              professor: texto(d.professor),
              turma: texto(d.turma),
              modulo: texto(d.moduloRed ?? d.modulo),
              statusDisciplina: texto(d.statusMatriculaDisciplina),
              statusMatricula: texto(d.statusMatricula),
              raw: d as object,
            };
            return this.prisma.jacadMatriculaDisciplina.upsert({
              where: { idMatriculaDisciplina: d.idMatriculaDisciplina },
              create: { idMatriculaDisciplina: d.idMatriculaDisciplina, ...dados },
              update: { ...dados, sincronizadoEm: new Date() },
            });
          }),
        );
        total += linhas.length;
      }

      if (++i % LOTE === 0) {
        this.log(`  ${i}/${matriculas.length} matrículas · ${total} disciplinas`);
      }
      await dormir(this.jacad.sleepMs);
    }

    this.log(
      `Disciplinas sincronizadas (período ${idPeriodoLetivo}): ${total} de ${matriculas.length} matrículas.`,
    );
    return total;
  }
}

const texto = (v: unknown): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  return t === '' ? null : t;
};
