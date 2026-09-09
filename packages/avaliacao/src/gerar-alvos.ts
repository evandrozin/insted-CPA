/**
 * Geração de tarefas e alvos de um ciclo de avaliação.
 *
 * É aqui que se decide **o que cada aluno vê**. Duas regras que o instrumento
 * da CPA exige e que não são óbvias no schema:
 *
 * 1. **O ciclo cobre o ANO, não o semestre.** Em 2026.2 o aluno responde sobre
 *    as disciplinas que cursa agora E sobre as que cursou em 2026.1. Os
 *    semestres abrangidos vêm de `EvaluationPeriodTerm`; sem nenhum vinculado,
 *    cai no `termId` principal do período.
 *
 * 2. **Modalidade muda a pergunta.** Uma disciplina EAD e uma presencial não
 *    recebem o mesmo questionário — em 2025 isso eram dois formulários
 *    separados no Drive. Aqui um bloco declara
 *    `targetFiltro = { "modalidades": ["EAD"] }`. Num bloco repetível isso
 *    gera alvos só das ofertas daquela modalidade; num bloco fixo, faz o
 *    bloco inteiro aparecer só para quem cursa aquela modalidade — é o que
 *    separa a infraestrutura perguntada ao aluno EAD (AVA, tutoria) da
 *    perguntada ao presencial (laboratório, convivência).
 *
 * Ofertas com modalidade NAO_INFORMADA não entram em bloco filtrado — entram
 * só em bloco sem filtro. Elas são relatadas ao final: silenciar isso faria o
 * aluno receber o questionário errado sem ninguém perceber.
 */
import type { PrismaClient, Modalidade, TargetType } from '@prisma/client';

type Progresso = (msg: string) => void;

export type ResultadoGeracao = {
  tarefas: number;
  alvos: number;
  respondentesSemAlvo: number;
  ofertasSemModalidade: number;
  semestresAbrangidos: string[];
  avisos: string[];
};

/** Formato aceito em `QuestionBlock.targetFiltro`. */
type TargetFiltro = {
  modalidades?: Modalidade[];
  departmentIds?: string[];
  semestres?: string[]; // códigos: ["2026.1"]
};

function lerFiltro(v: unknown): TargetFiltro {
  if (!v || typeof v !== 'object') return {};
  return v as TargetFiltro;
}

export class GeradorDeAlvos {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly onProgresso: Progresso = () => {},
  ) {}

  private log(m: string) {
    this.onProgresso(m);
  }


  /**
   * Tarefas de quem não é aluno: docente e técnico-administrativo.
   *
   * O respondente aqui não avalia disciplina cursada, então não há oferta de
   * onde derivar alvo. Recebe os blocos fixos do formulário — autoavaliação,
   * instituição, setores — e os repetíveis por DEPARTAMENTO, que são os
   * únicos que fazem sentido fora da matrícula.
   *
   * Bloco repetível por disciplina num formulário destes é configuração
   * equivocada: ele geraria um card por oferta que o respondente não tem.
   * Em vez de gerar nada em silêncio, entra como aviso.
   */
  private async gerarParaEquipe(
    periodId: string,
    periodForm: {
      id: string;
      publico: string;
      form: { nome: string; blocos: { id: string; titulo: string; ordem: number; targetType: TargetType; repetivel: boolean; targetFiltro: unknown }[] };
    },
    departamentos: { id: string; nome: string }[],
    r: ResultadoGeracao,
  ): Promise<void> {
    const papel = periodForm.publico as 'PROFESSOR' | 'TECNICO_ADMIN';

    const pessoas = await this.prisma.user.findMany({
      where: { role: papel, status: 'ATIVO', deletadoEm: null },
      select: { id: true },
    });

    this.log(`${pessoas.length} respondentes para "${periodForm.form.nome}" (${papel}).`);
    if (pessoas.length === 0) {
      r.avisos.push(
        `"${periodForm.form.nome}" não tem respondente: nenhum usuário ativo com papel ${papel}.`,
      );
      return;
    }

    const alvosBase: {
      blockId: string;
      targetType: TargetType;
      targetRefId: string | null;
      rotulo: string;
      subtitulo: string | null;
      ordem: number;
    }[] = [];
    let ordem = 0;

    for (const bloco of periodForm.form.blocos) {
      const porDisciplina =
        bloco.repetivel &&
        (bloco.targetType === 'PROFESSOR_DISCIPLINA' || bloco.targetType === 'DISCIPLINA');

      if (porDisciplina) {
        r.avisos.push(
          `Bloco "${bloco.titulo}" de "${periodForm.form.nome}" é repetível por disciplina, ` +
            `mas o público é ${papel} — ficou de fora.`,
        );
        continue;
      }

      if (bloco.repetivel && bloco.targetType === 'DEPARTAMENTO') {
        const filtro = lerFiltro(bloco.targetFiltro);
        const lista = filtro.departmentIds?.length
          ? departamentos.filter((d) => filtro.departmentIds!.includes(d.id))
          : departamentos;
        for (const d of lista) {
          alvosBase.push({
            blockId: bloco.id,
            targetType: 'DEPARTAMENTO',
            targetRefId: d.id,
            rotulo: d.nome,
            subtitulo: null,
            ordem: ordem++,
          });
        }
        continue;
      }

      alvosBase.push({
        blockId: bloco.id,
        targetType: bloco.targetType,
        targetRefId: null,
        rotulo: bloco.titulo,
        subtitulo: null,
        ordem: ordem++,
      });
    }

    for (const pessoa of pessoas) {
      const task = await this.prisma.evaluationTask.upsert({
        where: {
          periodFormId_respondentId: { periodFormId: periodForm.id, respondentId: pessoa.id },
        },
        create: { periodId, periodFormId: periodForm.id, respondentId: pessoa.id },
        update: {},
        select: { id: true, status: true },
      });

      if (task.status === 'CONCLUIDA') continue;

      await this.prisma.evaluationTaskTarget.deleteMany({ where: { taskId: task.id } });
      await this.prisma.evaluationTaskTarget.createMany({
        data: alvosBase.map((a) => ({ ...a, taskId: task.id })),
      });

      r.tarefas++;
      r.alvos += alvosBase.length;
    }
  }

  async gerar(periodId: string): Promise<ResultadoGeracao> {
    const r: ResultadoGeracao = {
      tarefas: 0,
      alvos: 0,
      respondentesSemAlvo: 0,
      ofertasSemModalidade: 0,
      semestresAbrangidos: [],
      avisos: [],
    };

    const periodo = await this.prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
      include: {
        term: true,
        semestres: { include: { term: true } },
        formularios: {
          include: {
            form: { include: { blocos: { orderBy: { ordem: 'asc' } } } },
          },
        },
      },
    });
    if (!periodo) throw new Error('Período de avaliação não encontrado.');
    if (periodo.formularios.length === 0) {
      throw new Error('Nenhum formulário vinculado a este período.');
    }

    // Semestres abrangidos: os vinculados, ou o principal como padrão.
    const terms =
      periodo.semestres.length > 0
        ? periodo.semestres.map((s) => ({ ...s.term, rotulo: s.rotulo }))
        : [{ ...periodo.term, rotulo: null as string | null }];

    const termIds = terms.map((t) => t.id);
    const rotuloTerm = new Map(terms.map((t) => [t.id, t.rotulo ?? t.codigo]));
    r.semestresAbrangidos = terms.map((t) => t.codigo);
    const multiSemestre = terms.length > 1;

    this.log(`Semestres abrangidos: ${r.semestresAbrangidos.join(', ')}`);

    /**
     * O semestre mais recente do ciclo — quem responde é quem está nele.
     *
     * Ordenar por (ano, semestre) e não pela ordem em que foram vinculados:
     * a CPA pode marcar os semestres em qualquer sequência na tela.
     */
    const semestreAtual = [...terms].sort(
      (a, b) => b.ano - a.ano || b.semestre - a.semestre,
    )[0];

    const turmasDoSemestreAtual = (
      await this.prisma.schoolClass.findMany({
        where: { termId: semestreAtual.id },
        select: { id: true },
      })
    ).map((t) => t.id);

    this.log(`Respondentes: quem está ativo em ${semestreAtual.codigo}.`);

    const departamentos = await this.prisma.department.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
    });

    for (const periodForm of periodo.formularios) {
      if (periodForm.publico !== 'ALUNO') {
        // Docente e técnico-administrativo não derivam alvos de matrícula: o
        // que eles avaliam não depende de disciplina cursada. Cada um recebe
        // uma tarefa com os blocos fixos do formulário, e é só.
        await this.gerarParaEquipe(periodId, periodForm, departamentos, r);
        continue;
      }

      // Respondentes: quem está ATIVO NO SEMESTRE MAIS RECENTE do ciclo.
      //
      // Não basta ter matrícula em algum semestre abrangido: quem cursou
      // 2026.1 e saiu da instituição não responde a avaliação de 2026 — ele
      // não está mais aqui. Quem responde é o aluno de agora; o semestre
      // anterior entra apenas como ESCOPO do que ele avalia (ver `ofertas`).
      const alunos = await this.prisma.user.findMany({
        where: {
          role: 'ALUNO',
          status: 'ATIVO',
          deletadoEm: null,
          matriculas: { some: { ativo: true, classId: { in: turmasDoSemestreAtual } } },
        },
        select: { id: true },
      });

      this.log(`${alunos.length} alunos elegíveis para "${periodForm.form.nome}".`);

      for (const aluno of alunos) {
        // Ofertas que o aluno cursa/cursou nos semestres abrangidos.
        //
        // Curso ou disciplina inativados no painel saem daqui — é o que dá
        // efeito real ao botão "inativar": a CPA exclui do ciclo o que não
        // deve ser avaliado (modalidades sem avaliação, disciplinas
        // descontinuadas) sem depender de mudar nada no JACAD.
        const ofertas = await this.prisma.studentSubject.findMany({
          where: {
            studentId: aluno.id,
            ativo: true,
            assignment: {
              ativo: true,
              termId: { in: termIds },
              subject: { ativo: true, OR: [{ course: null }, { course: { ativo: true } }] },
            },
          },
          select: {
            assignment: {
              select: {
                id: true,
                modalidade: true,
                termId: true,
                teacher: { select: { nome: true } },
                subject: { select: { nome: true } },
              },
            },
          },
        });

        const alvos: {
          blockId: string;
          targetType: TargetType;
          targetRefId: string | null;
          rotulo: string;
          subtitulo: string | null;
          ordem: number;
        }[] = [];
        let ordem = 0;

        // Modalidades que este aluno de fato cursa nos semestres do ciclo.
        // Serve para os blocos NÃO repetíveis: a infraestrutura perguntada a
        // quem estuda a distância não é a mesma — laboratório e espaço de
        // convivência não fazem sentido para ele, e o AVA e a tutoria não
        // fazem para quem é presencial.
        const modalidadesDoAluno = new Set(ofertas.map(({ assignment: a }) => a.modalidade));

        for (const bloco of periodForm.form.blocos) {
          const filtro = lerFiltro(bloco.targetFiltro);

          if (!bloco.repetivel) {
            // Bloco fixo com filtro de modalidade só aparece para quem cursa
            // aquela modalidade. Sem nenhuma oferta identificada, o bloco
            // filtrado não entra: é melhor faltar pergunta do que fazer a
            // errada — e a contagem de ofertas sem modalidade é relatada no
            // fim justamente para que isso não passe batido.
            if (
              filtro.modalidades?.length &&
              !filtro.modalidades.some((m) => modalidadesDoAluno.has(m))
            ) {
              continue;
            }

            alvos.push({
              blockId: bloco.id,
              targetType: bloco.targetType,
              targetRefId: null,
              rotulo: bloco.titulo,
              subtitulo: null,
              ordem: ordem++,
            });
            continue;
          }

          if (bloco.targetType === 'DEPARTAMENTO') {
            const lista = filtro.departmentIds?.length
              ? departamentos.filter((d) => filtro.departmentIds!.includes(d.id))
              : departamentos;
            for (const d of lista) {
              alvos.push({
                blockId: bloco.id,
                targetType: 'DEPARTAMENTO',
                targetRefId: d.id,
                rotulo: d.nome,
                subtitulo: null,
                ordem: ordem++,
              });
            }
            continue;
          }

          if (bloco.targetType === 'PROFESSOR_DISCIPLINA' || bloco.targetType === 'DISCIPLINA') {
            for (const { assignment: a } of ofertas) {
              // Bloco filtrado por modalidade só recebe a modalidade certa.
              // NAO_INFORMADA nunca casa: sem saber, não arriscamos a pergunta errada.
              if (filtro.modalidades?.length && !filtro.modalidades.includes(a.modalidade)) {
                continue;
              }
              if (filtro.semestres?.length) {
                const cod = rotuloTerm.get(a.termId);
                if (!cod || !filtro.semestres.includes(cod)) continue;
              }

              const semestre = rotuloTerm.get(a.termId);
              const sufixo = multiSemestre && semestre ? ` · ${semestre}` : '';

              alvos.push({
                blockId: bloco.id,
                targetType: bloco.targetType,
                targetRefId: a.id,
                rotulo:
                  bloco.targetType === 'PROFESSOR_DISCIPLINA' ? a.teacher.nome : a.subject.nome,
                subtitulo:
                  bloco.targetType === 'PROFESSOR_DISCIPLINA'
                    ? `${a.subject.nome}${sufixo}`
                    : sufixo.trim() || null,
                ordem: ordem++,
              });
            }
            continue;
          }

          // Repetível sobre alvo único: gera um só, e avisa.
          alvos.push({
            blockId: bloco.id,
            targetType: bloco.targetType,
            targetRefId: null,
            rotulo: bloco.titulo,
            subtitulo: null,
            ordem: ordem++,
          });
        }

        if (alvos.length === 0) {
          r.respondentesSemAlvo++;
          continue;
        }

        r.ofertasSemModalidade += ofertas.filter(
          (o) => o.assignment.modalidade === 'NAO_INFORMADA',
        ).length;

        // Idempotente: reexecutar após nova importação não duplica a tarefa,
        // e os alvos são recalculados do zero.
        const task = await this.prisma.evaluationTask.upsert({
          where: {
            periodFormId_respondentId: {
              periodFormId: periodForm.id,
              respondentId: aluno.id,
            },
          },
          create: { periodId, periodFormId: periodForm.id, respondentId: aluno.id },
          update: {},
          select: { id: true, status: true },
        });

        // Uma tarefa já concluída não é remexida — as respostas já existem.
        if (task.status === 'CONCLUIDA') continue;

        await this.prisma.evaluationTaskTarget.deleteMany({ where: { taskId: task.id } });
        await this.prisma.evaluationTaskTarget.createMany({
          data: alvos.map((a) => ({ ...a, taskId: task.id })),
        });

        r.tarefas++;
        r.alvos += alvos.length;
      }
    }

    if (r.ofertasSemModalidade > 0) {
      r.avisos.push(
        `${r.ofertasSemModalidade} ofertas com modalidade NÃO INFORMADA: elas ficam de fora ` +
          `de qualquer bloco filtrado por modalidade. Corrija a modalidade dos cursos no ` +
          `JACAD ou remova o filtro do bloco.`,
      );
    }
    if (r.respondentesSemAlvo > 0) {
      r.avisos.push(
        `${r.respondentesSemAlvo} alunos ficaram sem nenhum alvo e não receberam tarefa.`,
      );
    }

    return r;
  }
}
