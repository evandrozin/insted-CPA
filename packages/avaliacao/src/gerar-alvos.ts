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
 *
 * Duas portas de entrada, mesma regra:
 *
 * - `gerar` monta o ciclo inteiro, antes de abrir;
 * - `incluir` acrescenta quem ficou de fora DEPOIS de aberto — a matrícula
 *   regularizada na segunda semana, o aluno que o JACAD devolveu atrasado.
 *   Ela nunca mexe em tarefa existente: com o ciclo aberto, recalcular os
 *   cards de quem já começou a responder descartaria o que ele preencheu.
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

export type ResultadoInclusao = {
  incluidos: { matricula: string; nome: string; cards: number }[];
  recusados: { matricula: string; nome: string | null; motivo: string }[];
  alvos: number;
};

/** Formato aceito em `QuestionBlock.targetFiltro`. */
type TargetFiltro = {
  modalidades?: Modalidade[];
  departmentIds?: string[];
  semestres?: string[]; // códigos: ["2026.1"]
};

type Alvo = {
  blockId: string;
  targetType: TargetType;
  targetRefId: string | null;
  rotulo: string;
  subtitulo: string | null;
  ordem: number;
};

type BlocoDoForm = {
  id: string;
  titulo: string;
  ordem: number;
  targetType: TargetType;
  repetivel: boolean;
  targetFiltro: unknown;
};

type FormDoCiclo = {
  id: string;
  publico: string;
  form: { nome: string; blocos: BlocoDoForm[] };
};

/** Tudo que a geração precisa saber do ciclo, carregado uma vez. */
type Contexto = {
  periodId: string;
  formularios: FormDoCiclo[];
  termIds: string[];
  rotuloTerm: Map<string, string>;
  multiSemestre: boolean;
  semestresAbrangidos: string[];
  semestreAtual: { id: string; codigo: string };
  turmasDoSemestreAtual: string[];
  departamentos: { id: string; nome: string }[];
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

  // ───────────────────────────────────────────────────────────── contexto

  private async contexto(periodId: string): Promise<Contexto> {
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

    const departamentos = await this.prisma.department.findMany({
      where: { ativo: true },
      orderBy: { nome: 'asc' },
      select: { id: true, nome: true },
    });

    return {
      periodId,
      formularios: periodo.formularios,
      termIds: terms.map((t) => t.id),
      rotuloTerm: new Map(terms.map((t) => [t.id, t.rotulo ?? t.codigo])),
      multiSemestre: terms.length > 1,
      semestresAbrangidos: terms.map((t) => t.codigo),
      semestreAtual: { id: semestreAtual.id, codigo: semestreAtual.codigo },
      turmasDoSemestreAtual,
      departamentos,
    };
  }

  // ─────────────────────────────────────────────────────── cálculo de alvos

  /**
   * Cards de quem não é aluno: docente e técnico-administrativo.
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
  private alvosDeEquipe(ctx: Contexto, periodForm: FormDoCiclo, avisos: string[]): Alvo[] {
    const alvos: Alvo[] = [];
    let ordem = 0;

    for (const bloco of periodForm.form.blocos) {
      const porDisciplina =
        bloco.repetivel &&
        (bloco.targetType === 'PROFESSOR_DISCIPLINA' || bloco.targetType === 'DISCIPLINA');

      if (porDisciplina) {
        avisos.push(
          `Bloco "${bloco.titulo}" de "${periodForm.form.nome}" é repetível por disciplina, ` +
            `mas o público é ${periodForm.publico} — ficou de fora.`,
        );
        continue;
      }

      if (bloco.repetivel && bloco.targetType === 'DEPARTAMENTO') {
        const filtro = lerFiltro(bloco.targetFiltro);
        const lista = filtro.departmentIds?.length
          ? ctx.departamentos.filter((d) => filtro.departmentIds!.includes(d.id))
          : ctx.departamentos;
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

      alvos.push({
        blockId: bloco.id,
        targetType: bloco.targetType,
        targetRefId: null,
        rotulo: bloco.titulo,
        subtitulo: null,
        ordem: ordem++,
      });
    }
    return alvos;
  }

  /** Cards de UM aluno, a partir das ofertas que ele cursa no ano. */
  private async alvosDoAluno(
    ctx: Contexto,
    periodForm: FormDoCiclo,
    alunoId: string,
  ): Promise<{ alvos: Alvo[]; semModalidade: number }> {
    // Ofertas que o aluno cursa/cursou nos semestres abrangidos.
    //
    // Curso ou disciplina inativados no painel saem daqui — é o que dá
    // efeito real ao botão "inativar": a CPA exclui do ciclo o que não
    // deve ser avaliado (modalidades sem avaliação, disciplinas
    // descontinuadas) sem depender de mudar nada no JACAD.
    const ofertas = await this.prisma.studentSubject.findMany({
      where: {
        studentId: alunoId,
        ativo: true,
        assignment: {
          ativo: true,
          termId: { in: ctx.termIds },
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

    const alvos: Alvo[] = [];
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
          ? ctx.departamentos.filter((d) => filtro.departmentIds!.includes(d.id))
          : ctx.departamentos;
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
            const cod = ctx.rotuloTerm.get(a.termId);
            if (!cod || !filtro.semestres.includes(cod)) continue;
          }

          const semestre = ctx.rotuloTerm.get(a.termId);
          const sufixo = ctx.multiSemestre && semestre ? ` · ${semestre}` : '';

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

      // Repetível sobre alvo único: gera um só.
      alvos.push({
        blockId: bloco.id,
        targetType: bloco.targetType,
        targetRefId: null,
        rotulo: bloco.titulo,
        subtitulo: null,
        ordem: ordem++,
      });
    }

    const semModalidade = ofertas.filter(
      (o) => o.assignment.modalidade === 'NAO_INFORMADA',
    ).length;

    return { alvos, semModalidade };
  }

  // ──────────────────────────────────────────────────────────── gravação

  /**
   * Grava a tarefa e seus cards.
   *
   * - `soSeNova`: não toca em tarefa existente. É o modo do ciclo aberto —
   *   quem já começou a responder tem rascunho preso aos cards atuais, e
   *   recalcular os cards descartaria o que ele preencheu.
   * - Tarefa concluída nunca é remexida: as respostas já existem.
   */
  private async gravar(
    periodId: string,
    periodFormId: string,
    respondentId: string,
    alvos: Alvo[],
    soSeNova: boolean,
  ): Promise<'gravada' | 'existente' | 'concluida'> {
    const chave = { periodFormId_respondentId: { periodFormId, respondentId } };

    if (soSeNova) {
      const ja = await this.prisma.evaluationTask.findUnique({
        where: chave,
        select: { id: true },
      });
      if (ja) return 'existente';
    }

    // Idempotente: reexecutar após nova importação não duplica a tarefa,
    // e os alvos são recalculados do zero.
    const task = await this.prisma.evaluationTask.upsert({
      where: chave,
      create: { periodId, periodFormId, respondentId },
      update: {},
      select: { id: true, status: true },
    });

    if (task.status === 'CONCLUIDA') return 'concluida';

    await this.prisma.evaluationTaskTarget.deleteMany({ where: { taskId: task.id } });
    await this.prisma.evaluationTaskTarget.createMany({
      data: alvos.map((a) => ({ ...a, taskId: task.id })),
    });
    return 'gravada';
  }

  /** Quem responde um formulário de aluno: ativo no semestre mais recente. */
  private elegibilidadeAluno(ctx: Contexto) {
    // Não basta ter matrícula em algum semestre abrangido: quem cursou 2026.1
    // e saiu da instituição não responde a avaliação de 2026 — ele não está
    // mais aqui. Quem responde é o aluno de agora; o semestre anterior entra
    // apenas como ESCOPO do que ele avalia.
    return {
      role: 'ALUNO' as const,
      status: 'ATIVO' as const,
      deletadoEm: null,
      matriculas: { some: { ativo: true, classId: { in: ctx.turmasDoSemestreAtual } } },
    };
  }

  // ──────────────────────────────────────────────────────── ciclo inteiro

  async gerar(periodId: string): Promise<ResultadoGeracao> {
    const ctx = await this.contexto(periodId);
    const r: ResultadoGeracao = {
      tarefas: 0,
      alvos: 0,
      respondentesSemAlvo: 0,
      ofertasSemModalidade: 0,
      semestresAbrangidos: ctx.semestresAbrangidos,
      avisos: [],
    };

    this.log(`Semestres abrangidos: ${r.semestresAbrangidos.join(', ')}`);
    this.log(`Respondentes: quem está ativo em ${ctx.semestreAtual.codigo}.`);

    for (const periodForm of ctx.formularios) {
      if (periodForm.publico !== 'ALUNO') {
        // Docente e técnico-administrativo não derivam alvos de matrícula: o
        // que eles avaliam não depende de disciplina cursada.
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
          continue;
        }

        const alvos = this.alvosDeEquipe(ctx, periodForm, r.avisos);
        for (const pessoa of pessoas) {
          if ((await this.gravar(periodId, periodForm.id, pessoa.id, alvos, false)) === 'gravada') {
            r.tarefas++;
            r.alvos += alvos.length;
          }
        }
        continue;
      }

      const alunos = await this.prisma.user.findMany({
        where: this.elegibilidadeAluno(ctx),
        select: { id: true },
      });
      this.log(`${alunos.length} alunos elegíveis para "${periodForm.form.nome}".`);

      for (const aluno of alunos) {
        const { alvos, semModalidade } = await this.alvosDoAluno(ctx, periodForm, aluno.id);
        if (alvos.length === 0) {
          r.respondentesSemAlvo++;
          continue;
        }
        r.ofertasSemModalidade += semModalidade;

        if ((await this.gravar(periodId, periodForm.id, aluno.id, alvos, false)) === 'gravada') {
          r.tarefas++;
          r.alvos += alvos.length;
        }
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

  // ─────────────────────────────────────────────── inclusão com ciclo aberto

  /**
   * Acrescenta ao ciclo quem ficou de fora.
   *
   * - Com `matriculas`: só essas pessoas. Cada recusa vem com o motivo, porque
   *   a pergunta de quem pede a inclusão é sempre "por que não entrou?" — e
   *   "sem matrícula ativa em 2026.2" responde, enquanto um simples "falhou"
   *   devolve o problema para a CPA.
   * - Sem `matriculas`: todos os elegíveis que ainda não têm tarefa.
   *
   * Nunca altera tarefa existente — ver `gravar`.
   */
  async incluir(periodId: string, matriculas?: string[]): Promise<ResultadoInclusao> {
    const ctx = await this.contexto(periodId);
    const r: ResultadoInclusao = { incluidos: [], recusados: [], alvos: 0 };
    const avisosIgnorados: string[] = [];

    const formsPorPublico = new Map<string, FormDoCiclo[]>();
    for (const f of ctx.formularios) {
      formsPorPublico.set(f.publico, [...(formsPorPublico.get(f.publico) ?? []), f]);
    }

    const tentar = async (
      pessoa: { id: string; matricula: string; nome: string },
      periodForm: FormDoCiclo,
    ): Promise<void> => {
      const alvos =
        periodForm.publico === 'ALUNO'
          ? (await this.alvosDoAluno(ctx, periodForm, pessoa.id)).alvos
          : this.alvosDeEquipe(ctx, periodForm, avisosIgnorados);

      if (alvos.length === 0) {
        r.recusados.push({
          matricula: pessoa.matricula,
          nome: pessoa.nome,
          motivo:
            'nenhum card aplicável — confira se as disciplinas dele têm modalidade definida',
        });
        return;
      }

      const res = await this.gravar(periodId, periodForm.id, pessoa.id, alvos, true);
      if (res === 'existente') {
        r.recusados.push({
          matricula: pessoa.matricula,
          nome: pessoa.nome,
          motivo: 'já tem tarefa neste ciclo',
        });
        return;
      }
      r.incluidos.push({ matricula: pessoa.matricula, nome: pessoa.nome, cards: alvos.length });
      r.alvos += alvos.length;
    };

    // ── por matrícula ─────────────────────────────────────────────────────
    if (matriculas?.length) {
      for (const m of matriculas) {
        const pessoa = await this.prisma.user.findFirst({
          where: { matricula: m, deletadoEm: null },
          select: { id: true, matricula: true, nome: true, role: true, status: true },
        });

        if (!pessoa) {
          r.recusados.push({ matricula: m, nome: null, motivo: 'matrícula não encontrada' });
          continue;
        }

        const forms = formsPorPublico.get(pessoa.role) ?? [];
        if (forms.length === 0) {
          r.recusados.push({
            matricula: m,
            nome: pessoa.nome,
            motivo: `o ciclo não tem formulário para o perfil ${pessoa.role.toLowerCase()}`,
          });
          continue;
        }

        if (pessoa.status !== 'ATIVO') {
          r.recusados.push({
            matricula: m,
            nome: pessoa.nome,
            motivo: `cadastro ${pessoa.status.toLowerCase()} — ative em Cadastros → Usuários`,
          });
          continue;
        }

        if (pessoa.role === 'ALUNO') {
          const matriculado = await this.prisma.enrollment.count({
            where: {
              studentId: pessoa.id,
              ativo: true,
              classId: { in: ctx.turmasDoSemestreAtual },
            },
          });
          if (matriculado === 0) {
            r.recusados.push({
              matricula: m,
              nome: pessoa.nome,
              motivo: `sem matrícula ativa em ${ctx.semestreAtual.codigo} — importe as matrículas do JACAD de novo`,
            });
            continue;
          }
        }

        for (const f of forms) await tentar(pessoa, f);
      }
      return r;
    }

    // ── todos os que faltam ───────────────────────────────────────────────
    for (const periodForm of ctx.formularios) {
      const semTarefa = { tarefas: { none: { periodFormId: periodForm.id } } };

      const pessoas = await this.prisma.user.findMany({
        where:
          periodForm.publico === 'ALUNO'
            ? { ...this.elegibilidadeAluno(ctx), ...semTarefa }
            : {
                role: periodForm.publico as 'PROFESSOR' | 'TECNICO_ADMIN',
                status: 'ATIVO',
                deletadoEm: null,
                ...semTarefa,
              },
        select: { id: true, matricula: true, nome: true },
        orderBy: { nome: 'asc' },
      });

      this.log(`${pessoas.length} sem tarefa em "${periodForm.form.nome}".`);
      for (const p of pessoas) await tentar(p, periodForm);
    }

    return r;
  }
}
