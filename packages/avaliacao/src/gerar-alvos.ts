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
import type { Prisma, PrismaClient, Modalidade, TargetType } from '@prisma/client';

type Progresso = (msg: string) => void;

export type ResultadoGeracao = {
  tarefas: number;
  alvos: number;
  respondentesSemAlvo: number;
  ofertasSemModalidade: number;
  semestresAbrangidos: string[];
  avisos: string[];
};

/**
 * Recorte de uma geração: para QUEM gerar, entre os formulários do ciclo.
 *
 * Sem recorte, o gerador entrega cada formulário a todos os seus elegíveis —
 * era a única opção. O recorte existe para soltar um público de cada vez (os
 * docentes agora, os alunos EAD depois) sem refazer o ciclo inteiro.
 *
 * Os filtros de aluno só valem para formulário de aluno; docente e
 * técnico-administrativo não têm modalidade nem curso de matrícula.
 */
export type EscopoGeracao = {
  /** Ids de PeriodForm. Vazio ou ausente: todos os formulários do ciclo. */
  formularios?: string[];
  /** Aluno com ao menos uma disciplina em uma destas modalidades. */
  modalidades?: Modalidade[];
  /** Aluno com matrícula ativa em turma de um destes cursos, no semestre atual. */
  cursos?: string[];
};

/** Contagem de uma geração que ainda não aconteceu — só leitura. */
export type PreviaDoEscopo = {
  formularios: {
    periodFormId: string;
    nome: string;
    publico: string;
    elegiveis: number;
    jaTemTarefa: number;
    novas: number;
  }[];
  /** Alunos do recorte cujas disciplinas todas estão sem modalidade. */
  semModalidade: number;
};

/** Um card da tarefa de uma pessoa, com o que a tela de revisão precisa saber dele. */
export type CardDaTarefa = {
  id: string;
  blockId: string;
  targetType: TargetType;
  targetRefId: string | null;
  rotulo: string;
  subtitulo: string | null;
  ordem: number;
  /** O card já foi respondido e enviado: nunca é removido. */
  concluido: boolean;
  /** O gerador ainda produziria este card hoje, com as alocações e turmas atuais? */
  valido: boolean;
  /** Para um card que o gerador não produz mais: por quê, em palavras. */
  motivo: string | null;
  /** Pode ser removido: vem de bloco repetível e ainda não foi enviado. */
  removivel: boolean;
  /** Respostas em rascunho neste card — descartadas se ele for removido. */
  rascunhos: number;
};

/** Um card que o gerador produziria hoje e a tarefa ainda não tem. */
export type CardQueFalta = {
  blockId: string;
  targetType: TargetType;
  targetRefId: string | null;
  rotulo: string;
  subtitulo: string | null;
  ordem: number;
};

export type PlanoDaTarefa = {
  taskId: string;
  periodId: string;
  status: string;
  progresso: number;
  respondenteId: string;
  nome: string;
  matricula: string;
  papel: string;
  formulario: string;
  /** Falso para tarefa enviada ou retirada do ciclo: não há o que atualizar. */
  editavel: boolean;
  motivoBloqueio: string | null;
  cards: CardDaTarefa[];
  faltam: CardQueFalta[];
};

export type ResultadoAtualizacao = {
  removidos: number;
  rascunhosDescartados: number;
  incluidos: number;
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

/**
 * O que um docente leciona no ciclo — a base dos blocos que se repetem.
 *
 * O questionário docente de 2026 pede um bloco por CURSO em que ele atua
 * (coordenação e NDE daquele curso) e um por TURMA dele. Sem isto, quem dá
 * aula em três cursos avaliaria "a coordenação" uma vez só, sem dizer qual —
 * e a nota não serviria para nenhuma das três.
 */
type EscopoDocente = {
  cursos: { id: string; nome: string }[];
  turmas: { id: string; nome: string; curso: string | null }[];
  /**
   * As ofertas dele: turma × disciplina, uma por alocação ativa. Base do bloco
   * "disciplinas que leciona" — um card por oferta, e não por turma: quem dá
   * duas disciplinas à mesma turma percebe cada uma de um jeito.
   */
  ofertas: { id: string; disciplina: string; turma: string; termId: string }[];
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
        // Turma desativada no painel (Cadastros → Turmas) não existe para o
        // ciclo: o aluno que só está nela deixa de ser elegível, e as ofertas
        // dela deixam de virar card. Sem isto, desativar seria só visual.
        where: { termId: semestreAtual.id, ativo: true },
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

  /**
   * Cursos e turmas de cada docente, numa consulta só.
   *
   * Em lote, e não por pessoa: com duzentos docentes, uma consulta por
   * respondente seriam duzentas idas ao banco dentro do laço de geração — o
   * mesmo tipo de lentidão que já derrubou o envio de respostas uma vez.
   */
  private async escoposDocentes(
    ctx: Contexto,
    ids: string[],
  ): Promise<Map<string, EscopoDocente>> {
    const escopos = new Map<string, EscopoDocente>();
    if (ids.length === 0) return escopos;

    const alocacoes = await this.prisma.teachingAssignment.findMany({
      where: {
        teacherId: { in: ids },
        termId: { in: ctx.termIds },
        ativo: true,
        class: { ativo: true },
      },
      select: {
        id: true,
        teacherId: true,
        termId: true,
        subject: { select: { nome: true } },
        class: {
          select: {
            id: true,
            nome: true,
            course: { select: { id: true, nome: true, ativo: true } },
          },
        },
      },
    });

    for (const a of alocacoes) {
      const escopo = escopos.get(a.teacherId) ?? { cursos: [], turmas: [], ofertas: [] };

      // Curso inativado no painel sai do ciclo, como em todo o resto: é o que
      // dá efeito ao botão "inativar" sem depender de mexer no JACAD.
      if (a.class.course?.ativo && !escopo.cursos.some((c) => c.id === a.class.course!.id)) {
        escopo.cursos.push({ id: a.class.course.id, nome: a.class.course.nome });
      }
      if (!escopo.turmas.some((t) => t.id === a.class.id)) {
        escopo.turmas.push({
          id: a.class.id,
          nome: a.class.nome,
          curso: a.class.course?.nome ?? null,
        });
      }

      escopo.ofertas.push({
        id: a.id,
        disciplina: a.subject.nome,
        turma: a.class.nome,
        termId: a.termId,
      });

      escopos.set(a.teacherId, escopo);
    }

    for (const escopo of escopos.values()) {
      escopo.cursos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      escopo.turmas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      escopo.ofertas.sort(
        (a, b) =>
          a.turma.localeCompare(b.turma, 'pt-BR') ||
          a.disciplina.localeCompare(b.disciplina, 'pt-BR'),
      );
    }

    return escopos;
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
  private alvosDeEquipe(
    ctx: Contexto,
    periodForm: FormDoCiclo,
    escopo: EscopoDocente | undefined,
    avisos: string[],
  ): Alvo[] {
    const alvos: Alvo[] = [];
    let ordem = 0;

    for (const bloco of periodForm.form.blocos) {
      // Docente: "disciplinas que leciona" — um card por oferta (turma ×
      // disciplina) dele no semestre do ciclo. É o que o tipo DISCIPLINA quer
      // dizer quando quem responde é professor.
      if (
        bloco.repetivel &&
        bloco.targetType === 'DISCIPLINA' &&
        periodForm.publico === 'PROFESSOR'
      ) {
        for (const oferta of escopo?.ofertas ?? []) {
          const semestre = ctx.rotuloTerm.get(oferta.termId);
          alvos.push({
            blockId: bloco.id,
            targetType: 'DISCIPLINA',
            targetRefId: oferta.id,
            rotulo: oferta.disciplina,
            subtitulo: ctx.multiSemestre && semestre ? `${oferta.turma} · ${semestre}` : oferta.turma,
            ordem: ordem++,
          });
        }
        continue;
      }

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

      // Um card por curso em que o docente atua: coordenação e NDE são de um
      // curso, não da instituição.
      if (bloco.repetivel && bloco.targetType === 'CURSO') {
        for (const curso of escopo?.cursos ?? []) {
          alvos.push({
            blockId: bloco.id,
            targetType: 'CURSO',
            targetRefId: curso.id,
            rotulo: curso.nome,
            subtitulo: null,
            ordem: ordem++,
          });
        }
        continue;
      }

      // Um card por turma do docente. A turma é a unidade que ele reconhece ao
      // opinar sobre "a turma": mesmo dando duas disciplinas para a mesma
      // turma, a percepção é uma só.
      if (bloco.repetivel && bloco.targetType === 'TURMA') {
        for (const turma of escopo?.turmas ?? []) {
          alvos.push({
            blockId: bloco.id,
            targetType: 'TURMA',
            targetRefId: turma.id,
            rotulo: turma.nome,
            subtitulo: turma.curso,
            ordem: ordem++,
          });
        }
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
    //
    // A matrícula também manda: a oferta nasce da matrícula do JACAD (a
    // alocação guarda a turma dela), e matrícula inativada na tela de
    // Matrículas não pode seguir gerando card de professor. Só sai a oferta de
    // turma onde o aluno TEM matrícula e ela está inativa — sem matrícula
    // nenhuma naquela turma (optativa, DP) a oferta continua valendo.
    const [ofertasDoAluno, matriculas] = await Promise.all([
      this.prisma.studentSubject.findMany({
        where: {
          studentId: alunoId,
          ativo: true,
          assignment: {
            ativo: true,
            class: { ativo: true },
            termId: { in: ctx.termIds },
            subject: { ativo: true, OR: [{ course: null }, { course: { ativo: true } }] },
          },
        },
        select: {
          assignment: {
            select: {
              id: true,
              classId: true,
              modalidade: true,
              termId: true,
              teacher: { select: { nome: true } },
              subject: { select: { nome: true } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { studentId: alunoId },
        select: { classId: true, ativo: true },
      }),
    ]);
    const turmasInativas = new Set(matriculas.filter((m) => !m.ativo).map((m) => m.classId));
    const ofertas = ofertasDoAluno.filter(({ assignment: a }) => !turmasInativas.has(a.classId));

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

    // Retirado do ciclo pela CPA: a tarefa fica de propósito, justamente para
    // que reexecutar a geração não o traga de volta. Sem esta linha, o botão
    // "Gerar tarefas" recriaria os cards de todo mundo que foi retirado — o
    // status continuaria DISPENSADA, mas os alvos voltariam a existir.
    if (task.status === 'DISPENSADA') return 'existente';

    await this.prisma.evaluationTaskTarget.deleteMany({ where: { taskId: task.id } });
    await this.prisma.evaluationTaskTarget.createMany({
      data: alvos.map((a) => ({ ...a, taskId: task.id })),
    });
    return 'gravada';
  }

  // ───────────────────────────────────────── atualização de UMA tarefa

  /**
   * Os cards que o gerador produziria hoje para a pessoa dona de uma tarefa.
   *
   * É a MESMA regra da geração (`alvosDoAluno`, `alvosDeEquipe`), de propósito:
   * "o que deveria estar aqui" não pode ter uma segunda definição, ou a tela de
   * revisão e o gerador discordariam sobre o que é um card errado.
   */
  private async cardsDesejados(taskId: string) {
    const task = await this.prisma.evaluationTask.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        periodId: true,
        periodFormId: true,
        status: true,
        progresso: true,
        respondent: { select: { id: true, nome: true, matricula: true, role: true } },
      },
    });
    if (!task) throw new Error('Tarefa não encontrada.');

    const ctx = await this.contexto(task.periodId);
    const periodForm = ctx.formularios.find((f) => f.id === task.periodFormId);
    if (!periodForm) throw new Error('O formulário desta tarefa não está mais no ciclo.');

    let alvos: Alvo[];
    if (periodForm.publico === 'ALUNO') {
      alvos = (await this.alvosDoAluno(ctx, periodForm, task.respondent.id)).alvos;
    } else {
      const escopo =
        periodForm.publico === 'PROFESSOR'
          ? (await this.escoposDocentes(ctx, [task.respondent.id])).get(task.respondent.id)
          : undefined;
      alvos = this.alvosDeEquipe(ctx, periodForm, escopo, []);
    }

    return { task, periodForm, alvos };
  }

  /**
   * O que mudaria na tarefa de UMA pessoa, sem gravar nada.
   *
   * Existe porque a tarefa é gerada uma vez e as alocações mudam depois — o
   * docente cuja turma foi trocada, a turma desativada. Refazer o ciclo inteiro
   * destruiria o rascunho de quem já começou; aqui só se mexe numa pessoa, e
   * só no que ela mesma confirmar.
   */
  async planejarTarefa(taskId: string): Promise<PlanoDaTarefa> {
    const { task, periodForm, alvos } = await this.cardsDesejados(taskId);

    const chave = (blockId: string, ref: string | null) => `${blockId}|${ref ?? ''}`;
    const desejados = new Set(alvos.map((a) => chave(a.blockId, a.targetRefId)));
    const repetiveis = new Set(periodForm.form.blocos.filter((b) => b.repetivel).map((b) => b.id));

    const atuais = await this.prisma.evaluationTaskTarget.findMany({
      where: { taskId },
      orderBy: { ordem: 'asc' },
    });

    // Rascunhos por card: o rascunho é chaveado por pergunta + referência, e a
    // pergunta diz de que bloco é. Só a contagem sai daqui — nunca o conteúdo.
    const rascunhos = await this.prisma.draftAnswer.findMany({
      where: { taskId },
      select: { targetRefId: true, question: { select: { blockId: true } } },
    });
    const porCard = new Map<string, number>();
    for (const r of rascunhos) {
      const k = `${r.question.blockId}|${r.targetRefId}`;
      porCard.set(k, (porCard.get(k) ?? 0) + 1);
    }

    const motivoDe = (t: { targetType: TargetType }) => {
      switch (t.targetType) {
        case 'TURMA':
          return 'esta turma não está mais entre as turmas ativas dele (oferta desligada, trocada ou turma inativa)';
        case 'CURSO':
          return 'ele não tem mais oferta ativa neste curso';
        case 'PROFESSOR_DISCIPLINA':
        case 'DISCIPLINA':
          return 'a oferta foi desligada, trocada ou a pessoa saiu dela';
        case 'DEPARTAMENTO':
          return 'este setor não faz mais parte da configuração do formulário';
        default:
          return 'o formulário não gera mais este card';
      }
    };

    const cards: CardDaTarefa[] = atuais.map((t) => {
      const valido = desejados.has(chave(t.blockId, t.targetRefId));
      return {
        id: t.id,
        blockId: t.blockId,
        targetType: t.targetType,
        targetRefId: t.targetRefId,
        rotulo: t.rotulo,
        subtitulo: t.subtitulo,
        ordem: t.ordem,
        concluido: t.concluido,
        valido,
        motivo: valido ? null : motivoDe(t),
        removivel: repetiveis.has(t.blockId) && !t.concluido,
        rascunhos: porCard.get(`${t.blockId}|${t.targetRefId ?? '__global__'}`) ?? 0,
      };
    });

    const existentes = new Set(atuais.map((t) => chave(t.blockId, t.targetRefId)));
    const faltam = alvos.filter((a) => !existentes.has(chave(a.blockId, a.targetRefId)));

    const bloqueio =
      task.status === 'CONCLUIDA'
        ? 'Esta tarefa já foi enviada: os cards dela não mudam mais.'
        : task.status === 'DISPENSADA'
          ? 'Esta pessoa foi retirada do ciclo. Recoloque-a antes de mexer nos cards.'
          : null;

    return {
      taskId,
      periodId: task.periodId,
      status: task.status,
      progresso: task.progresso,
      respondenteId: task.respondent.id,
      nome: task.respondent.nome,
      matricula: task.respondent.matricula,
      papel: task.respondent.role,
      formulario: periodForm.form.nome,
      editavel: bloqueio === null,
      motivoBloqueio: bloqueio,
      cards,
      faltam,
    };
  }

  /**
   * Aplica numa tarefa só o que a CPA marcou: remove os cards escolhidos e,
   * se pedido, inclui os que faltam.
   *
   * Regras que não se negociam:
   * - o plano é recalculado AQUI, e a remoção é a interseção do que foi pedido
   *   com o que o plano diz ser removível — um id forjado ou velho não remove
   *   card fixo nem card já enviado;
   * - o rascunho dos cards que ficam não é tocado; o dos removidos é descartado
   *   (é o preço de tirar o card, e a tela avisa antes);
   * - tudo numa transação, e a ordem dos cards é reajustada à do formulário.
   */
  async atualizarTarefa(
    taskId: string,
    opcoes: { remover: string[]; incluirFaltantes: boolean },
  ): Promise<ResultadoAtualizacao> {
    const plano = await this.planejarTarefa(taskId);
    if (!plano.editavel) throw new Error(plano.motivoBloqueio ?? 'Tarefa não editável.');

    const pedidos = new Set(opcoes.remover);
    const remover = plano.cards.filter((c) => c.removivel && pedidos.has(c.id));
    const incluir = opcoes.incluirFaltantes ? plano.faltam : [];

    if (remover.length === 0 && incluir.length === 0) {
      return { removidos: 0, rascunhosDescartados: 0, incluidos: 0 };
    }

    const { alvos } = await this.cardsDesejados(taskId);
    const ordemDesejada = new Map(
      alvos.map((a) => [`${a.blockId}|${a.targetRefId ?? ''}`, a.ordem] as const),
    );

    let rascunhosDescartados = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const c of remover) {
        if (c.targetRefId !== null) {
          rascunhosDescartados += (
            await tx.draftAnswer.deleteMany({
              where: { taskId, targetRefId: c.targetRefId, question: { blockId: c.blockId } },
            })
          ).count;
        }
        await tx.evaluationTaskTarget.delete({ where: { id: c.id } });
      }

      if (incluir.length > 0) {
        await tx.evaluationTaskTarget.createMany({
          data: incluir.map((a) => ({ ...a, taskId })),
        });
      }

      // A ordem volta a ser a do formulário. Quem sobrou fora da lista desejada
      // (card mantido de propósito) vai para o fim, na ordem em que estava.
      const restantes = await tx.evaluationTaskTarget.findMany({ where: { taskId } });
      const ordenados = restantes
        .map((t) => ({
          id: t.id,
          ordem: t.ordem,
          alvo: ordemDesejada.get(`${t.blockId}|${t.targetRefId ?? ''}`) ?? 10_000 + t.ordem,
        }))
        .sort((x, y) => x.alvo - y.alvo || x.ordem - y.ordem);
      for (const [i, t] of ordenados.entries()) {
        if (t.ordem !== i) {
          await tx.evaluationTaskTarget.update({ where: { id: t.id }, data: { ordem: i } });
        }
      }
    });

    await this.recalcularProgresso(taskId);

    return { removidos: remover.length, rascunhosDescartados, incluidos: incluir.length };
  }

  /**
   * Mesma conta do salvamento de etapa (`responder/actions.ts`): respostas em
   * rascunho sobre o total previsto. Só mexe em tarefa em andamento — a
   * pendente continua em zero, e a enviada nem chega aqui.
   */
  private async recalcularProgresso(taskId: string): Promise<void> {
    const task = await this.prisma.evaluationTask.findUnique({
      where: { id: taskId },
      select: { status: true },
    });
    if (task?.status !== 'EM_ANDAMENTO') return;

    const [respondidas, alvos] = await Promise.all([
      this.prisma.draftAnswer.count({ where: { taskId } }),
      this.prisma.evaluationTaskTarget.findMany({ where: { taskId }, select: { blockId: true } }),
    ]);
    const porBloco = alvos.length
      ? await this.prisma.question.groupBy({
          by: ['blockId'],
          where: { blockId: { in: [...new Set(alvos.map((a) => a.blockId))] }, ativa: true },
          _count: true,
        })
      : [];
    const mapa = new Map(porBloco.map((b) => [b.blockId, b._count]));
    const total = alvos.reduce((t, a) => t + (mapa.get(a.blockId) ?? 0), 0);

    await this.prisma.evaluationTask.update({
      where: { id: taskId },
      data: { progresso: total ? Math.min(99, Math.round((respondidas / total) * 100)) : 0 },
    });
  }

  /** Os formulários do ciclo que o recorte alcança. */
  private formulariosDoEscopo(ctx: Contexto, escopo?: EscopoGeracao): FormDoCiclo[] {
    const ids = escopo?.formularios;
    return ids && ids.length > 0 ? ctx.formularios.filter((f) => ids.includes(f.id)) : ctx.formularios;
  }

  /**
   * Filtros extras de aluno, para somar à elegibilidade.
   *
   * A modalidade segue a regra que já vale nos blocos: aluno "é" de uma
   * modalidade quando tem ao menos uma disciplina nela, nos semestres do ciclo.
   * Disciplina ou curso inativado no painel não conta — a mesma exclusão que
   * a geração dos cards aplica. O aluno misto casa com as duas.
   */
  private filtrosDeAluno(ctx: Contexto, escopo?: EscopoGeracao): Prisma.UserWhereInput[] {
    const e: Prisma.UserWhereInput[] = [];

    if (escopo?.modalidades && escopo.modalidades.length > 0) {
      e.push({
        inscricoesDisciplina: {
          some: {
            ativo: true,
            assignment: {
              ativo: true,
              class: { ativo: true },
              termId: { in: ctx.termIds },
              modalidade: { in: escopo.modalidades },
              subject: { ativo: true, OR: [{ course: null }, { course: { ativo: true } }] },
            },
          },
        },
      });
    }

    if (escopo?.cursos && escopo.cursos.length > 0) {
      e.push({
        matriculas: {
          some: {
            ativo: true,
            classId: { in: ctx.turmasDoSemestreAtual },
            class: { courseId: { in: escopo.cursos } },
          },
        },
      });
    }

    return e;
  }

  /**
   * Quantas pessoas cada formulário alcançaria — sem escrever nada.
   *
   * Só contagem, de propósito: calcular os cards de cada aluno para dizer "vão
   * ser 9,0 por pessoa" seria uma consulta por aluno, e a prévia existe para
   * ser rápida o bastante para clicar antes de cada geração.
   */
  async previa(periodId: string, escopo?: EscopoGeracao): Promise<PreviaDoEscopo> {
    const ctx = await this.contexto(periodId);
    const r: PreviaDoEscopo = { formularios: [], semModalidade: 0 };

    for (const f of this.formulariosDoEscopo(ctx, escopo)) {
      const base: Prisma.UserWhereInput =
        f.publico === 'ALUNO'
          ? { ...this.elegibilidadeAluno(ctx), AND: this.filtrosDeAluno(ctx, escopo) }
          : {
              role: f.publico as 'PROFESSOR' | 'TECNICO_ADMIN',
              status: 'ATIVO',
              deletadoEm: null,
            };

      const [elegiveis, jaTemTarefa] = await Promise.all([
        this.prisma.user.count({ where: base }),
        this.prisma.user.count({
          where: { ...base, tarefas: { some: { periodFormId: f.id } } },
        }),
      ]);

      r.formularios.push({
        periodFormId: f.id,
        nome: f.form.nome,
        publico: f.publico,
        elegiveis,
        jaTemTarefa,
        novas: elegiveis - jaTemTarefa,
      });
    }

    // Quem o filtro de modalidade nunca alcança: disciplinas todas sem
    // modalidade. Só faz sentido contar com o filtro ligado.
    if (escopo?.modalidades && escopo.modalidades.length > 0) {
      r.semModalidade = await this.prisma.user.count({
        where: {
          ...this.elegibilidadeAluno(ctx),
          AND: this.filtrosDeAluno(ctx, { cursos: escopo.cursos }),
          inscricoesDisciplina: {
            none: {
              ativo: true,
              assignment: {
                ativo: true,
                class: { ativo: true },
                termId: { in: ctx.termIds },
                modalidade: { in: ['PRESENCIAL', 'SEMIPRESENCIAL', 'EAD'] },
              },
            },
          },
        },
      });
    }

    return r;
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

  async gerar(periodId: string, escopo?: EscopoGeracao): Promise<ResultadoGeracao> {
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

    for (const periodForm of this.formulariosDoEscopo(ctx, escopo)) {
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

        // Os cards deixaram de ser iguais para todos: quem leciona em três
        // cursos recebe três blocos de coordenação. Por isso o escopo é
        // buscado em lote antes do laço, e os alvos montados por pessoa.
        const escopos =
          papel === 'PROFESSOR'
            ? await this.escoposDocentes(ctx, pessoas.map((p) => p.id))
            : new Map<string, EscopoDocente>();

        let semTurma = 0;

        for (const pessoa of pessoas) {
          const escopo = escopos.get(pessoa.id);
          if (papel === 'PROFESSOR' && !escopo) semTurma++;

          const alvos = this.alvosDeEquipe(ctx, periodForm, escopo, r.avisos);
          if ((await this.gravar(periodId, periodForm.id, pessoa.id, alvos, false)) === 'gravada') {
            r.tarefas++;
            r.alvos += alvos.length;
          }
        }

        if (semTurma > 0) {
          r.avisos.push(
            `${semTurma} docentes não têm turma nos semestres do ciclo: receberam o ` +
              'questionário sem os blocos por curso e por turma.',
          );
        }
        continue;
      }

      const alunos = await this.prisma.user.findMany({
        where: { ...this.elegibilidadeAluno(ctx), AND: this.filtrosDeAluno(ctx, escopo) },
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
  async incluir(
    periodId: string,
    matriculas?: string[],
    escopo?: EscopoGeracao,
  ): Promise<ResultadoInclusao> {
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
          : this.alvosDeEquipe(
              ctx,
              periodForm,
              (await this.escoposDocentes(ctx, [pessoa.id])).get(pessoa.id),
              avisosIgnorados,
            );

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
    // O recorte vale só aqui: quando a CPA informa matrículas, ela já escolheu
    // as pessoas, e filtrar de novo recusaria quem ela pediu pelo nome.
    for (const periodForm of this.formulariosDoEscopo(ctx, escopo)) {
      const semTarefa = { tarefas: { none: { periodFormId: periodForm.id } } };

      const pessoas = await this.prisma.user.findMany({
        where:
          periodForm.publico === 'ALUNO'
            ? {
                ...this.elegibilidadeAluno(ctx),
                ...semTarefa,
                AND: this.filtrosDeAluno(ctx, escopo),
              }
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
