/**
 * Promoção: staging jacad_* → entidades do CPA.
 *
 * Separado da ingestão de propósito. Reprocessar o mapeamento (corrigir um
 * turno, mudar a regra de nome de turma) não deve exigir bater na API de novo.
 *
 * Idempotente: rodar duas vezes não duplica nada.
 */
import type { PrismaClient, Shift, Modalidade } from '@prisma/client';

type Progresso = (msg: string) => void;

export type ResultadoPromocao = {
  cursos: number;
  semestres: number;
  turmas: number;
  disciplinas: number;
  alunos: number;            // usuários ALUNO distintos
  matriculasProcessadas: number; // linhas de matrícula (um aluno pode ter 2 cursos)
  professores: number;
  professoresConciliados: number;
  alocacoes: number;
  matriculasTurma: number;
  inscricoesDisciplina: number;
  professoresPendentes: string[];
  emailsDuplicados: string[];
  /// Ofertas descartadas por não ter docente definido ("A Confirmar" e afins).
  ofertasSemDocente: number;
};

/**
 * Modalidade de uma oferta de disciplina.
 *
 * O JACAD não tem um campo "modalidade da disciplina". Duas fontes, nesta
 * ordem: a turma que OFERTA a disciplina (turno EAD é o sinal mais forte, e
 * cobre a disciplina EAD dentro de um curso presencial), e a modalidade do
 * curso.
 *
 * Quando nenhuma das duas informa, fica NAO_INFORMADA — de propósito. Assumir
 * "presencial" por omissão faria 35% dos alunos receberem o questionário
 * errado em silêncio.
 */
function modalidade(
  turnoOfertante: string | null,
  modalidadeCurso: string | null,
  /** Definida à mão no painel — última palavra antes de desistir. */
  padraoDaDisciplina: Modalidade | null,
): Modalidade {
  if ((turnoOfertante ?? '').toUpperCase() === 'EAD') return 'EAD';

  const c = (modalidadeCurso ?? '').toUpperCase();
  if (c.includes('SEMI')) return 'SEMIPRESENCIAL';
  if (c.includes('EAD') || c.includes('DIST')) return 'EAD';
  if (c.includes('PRESENC')) return 'PRESENCIAL';

  return padraoDaDisciplina ?? 'NAO_INFORMADA';
}

/** Turnos do JACAD vêm em texto livre; o que não casar fica NOTURNO com aviso. */
function turno(v: string | null): Shift {
  const t = (v ?? '').toUpperCase();
  if (t.includes('MATUT') || t.includes('MANH')) return 'MATUTINO';
  if (t.includes('VESPER') || t.includes('TARDE')) return 'VESPERTINO';
  if (t.includes('INTEG')) return 'INTEGRAL';
  if (t.includes('EAD') || t.includes('DIST') || t.includes('ONLINE')) return 'EAD';
  return 'NOTURNO';
}

/**
 * Nomes que o JACAD usa como marcador de "docente ainda não definido".
 *
 * Não são pessoas: em 2026.2, "A Confirmar" aparecia em 56 ofertas EAD. Sem
 * este filtro, ele vira um usuário PROFESSOR e os alunos recebem um card para
 * avaliar um placeholder — que depois entra na média como se fosse gente.
 *
 * A oferta é ignorada por inteiro: sem professor definido não há o que avaliar.
 */
const NOMES_PLACEHOLDER = [
  'a confirmar',
  'a definir',
  'a designar',
  'nao definido',
  'sem professor',
  'professor',
  'docente',
  'xxx',
];

function ehPlaceholder(chaveNormalizada: string): boolean {
  return NOMES_PLACEHOLDER.includes(chaveNormalizada);
}

/** "MARIA DA SILVA  " -> "maria da silva" (chave de deduplicação). */
function chaveNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '') // remove os acentos separados pelo NFD
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Código estável a partir de um nome, para entidades que o JACAD não numera
 * (disciplinas, e docentes não conciliados).
 *
 * O sufixo de hash não é enfeite: sem ele, truncar o slug funde registros
 * distintos. "Direito Civil — Teoria Geral do Direito Privado I" e "…II"
 * colidiam em 40 caracteres, e 13 disciplinas de "CPP - Competências Pessoais
 * e Profissionais" viravam uma só — misturando as médias de disciplinas
 * diferentes no relatório final.
 *
 * O hash é calculado sobre a chave JÁ normalizada, então variações de grafia
 * do mesmo nome continuam convergindo para o mesmo código.
 */
function codigoEstavel(prefixo: string, chaveNormalizada: string): string {
  // FNV-1a 32 bits — determinístico e suficiente para este volume.
  let h = 0x811c9dc5;
  for (let i = 0; i < chaveNormalizada.length; i++) {
    h ^= chaveNormalizada.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const slug = chaveNormalizada.replace(/[^a-z0-9]+/g, '-').slice(0, 32).replace(/-+$/, '');
  return `${prefixo}${slug}-${h.toString(36)}`;
}

/** Título em caixa mista a partir do nome cru do JACAD (costuma vir em CAIXA ALTA). */
function nomeProprio(nome: string): string {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return nome
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ')
    .trim();
}

export class JacadPromotor {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly onProgresso: Progresso = () => {},
  ) {}

  private log(m: string) {
    this.onProgresso(m);
  }

  async promover(idPeriodoLetivo: number): Promise<ResultadoPromocao> {
    const r: ResultadoPromocao = {
      cursos: 0,
      semestres: 0,
      turmas: 0,
      disciplinas: 0,
      alunos: 0,
      matriculasProcessadas: 0,
      professores: 0,
      professoresConciliados: 0,
      alocacoes: 0,
      matriculasTurma: 0,
      inscricoesDisciplina: 0,
      professoresPendentes: [],
      emailsDuplicados: [],
      ofertasSemDocente: 0,
    };

    // ---------------------------------------------------------- 1. semestre
    const periodo = await this.prisma.jacadPeriodoLetivo.findUnique({
      where: { idPeriodoLetivo },
    });
    if (!periodo) throw new Error(`Período ${idPeriodoLetivo} não está em staging.`);
    if (!periodo.ano || !periodo.semestre) {
      throw new Error(
        `Período ${idPeriodoLetivo} sem ano/semestre no JACAD — não dá para gerar o código do semestre letivo.`,
      );
    }

    const codigoTerm = `${periodo.ano}.${periodo.semestre}`;
    const term = await this.prisma.academicTerm.upsert({
      where: { codigo: codigoTerm },
      create: {
        codigo: codigoTerm,
        ano: periodo.ano,
        semestre: periodo.semestre,
        inicioEm: new Date(periodo.ano, (periodo.semestre - 1) * 6, 1),
        fimEm: new Date(periodo.ano, (periodo.semestre - 1) * 6 + 5, 30),
      },
      update: {},
    });
    r.semestres = 1;

    // ------------------------------------------------------------ 2. cursos
    const cursosJacad = await this.prisma.jacadCurso.findMany();
    const cursoPorId = new Map<number, string>();

    for (const c of cursosJacad) {
      const codigo = c.codigoCurso?.trim() || `JACAD-${c.idCursoBase}`;
      const curso = await this.prisma.course.upsert({
        where: { codigo },
        create: {
          codigo,
          nome: c.nomeImpressao ?? c.nomeReduzido ?? `Curso ${c.idCursoBase}`,
          grau: c.grau ?? null,
          modalidade: c.modalidade ?? null,
        },
        update: {
          nome: c.nomeImpressao ?? c.nomeReduzido ?? `Curso ${c.idCursoBase}`,
          grau: c.grau ?? null,
          modalidade: c.modalidade ?? null,
        },
      });
      cursoPorId.set(c.idCursoBase, curso.id);
      r.cursos++;
    }

    // ------------------------------------------------------------- 3. turmas
    // ENCERRADA entra: o ciclo da CPA é anual, e o semestre já concluído é
    // justamente o que precisa ser avaliado — suas turmas estão todas
    // encerradas. Sem isto, promover 2026.1 gerava zero turmas e zero
    // alocações, e o aluno não recebia nenhum card do primeiro semestre.
    //
    // CANCELADA fica de fora: turma cancelada não teve aula, não há o que avaliar.
    const turmasJacad = await this.prisma.jacadTurma.findMany({
      where: { idPeriodoLetivo, status: { in: ['ATIVA', 'AGUARDANDO', 'ENCERRADA'] } },
    });
    const turmaPorId = new Map<number, string>();

    for (const t of turmasJacad) {
      const courseId = t.idCurso ? cursoPorId.get(t.idCurso) : undefined;
      if (!courseId) {
        this.log(`  ⚠ turma ${t.idTurma} ignorada: curso ${t.idCurso} não encontrado`);
        continue;
      }

      const codigo = `JACAD-${t.idTurma}`;
      const turma = await this.prisma.schoolClass.upsert({
        where: { codigo_termId: { codigo, termId: term.id } },
        create: {
          codigo,
          nome: t.nome ?? t.nomeReduzido ?? `Turma ${t.idTurma}`,
          courseId,
          termId: term.id,
          turno: turno(t.turno),
          periodo: t.periodoNumero,
        },
        update: {
          nome: t.nome ?? t.nomeReduzido ?? `Turma ${t.idTurma}`,
          courseId,
          turno: turno(t.turno),
          periodo: t.periodoNumero,
        },
      });
      turmaPorId.set(t.idTurma, turma.id);
      r.turmas++;
    }

    // --------------------------------------------- 4. alunos + matrículas
    const matriculas = await this.prisma.jacadMatricula.findMany({
      where: { idPeriodoLetivo },
    });

    /**
     * Situação do aluno pela matrícula MAIS RECENTE, não pela deste período.
     *
     * Num semestre concluído ninguém aparece como "ATIVA": os status são
     * APROVADO, REPROVADO, TRANCADA. Promover 2026.1 depois de 2026.2 fazia
     * o aluno aprovado no primeiro semestre virar INATIVO — e aluno inativo
     * não recebe tarefa nem consegue entrar no sistema. Na prática, importar
     * o semestre passado desligava a instituição inteira.
     */
    const situacaoAtual = new Map<string, string>();
    {
      const todas = await this.prisma.jacadMatricula.findMany({
        where: { ra: { not: null } },
        select: { ra: true, status: true, idPeriodoLetivo: true },
        orderBy: { idPeriodoLetivo: 'asc' },
      });
      // Ordenado por período crescente: a última gravação por RA é a mais nova.
      for (const m of todas) if (m.ra) situacaoAtual.set(m.ra, m.status ?? '');
    }

    const ATIVAS = new Set(['ATIVA', 'AGUARDANDO']);
    const statusDoAluno = (ra: string): 'ATIVO' | 'INATIVO' =>
      ATIVAS.has((situacaoAtual.get(ra) ?? '').toUpperCase()) ? 'ATIVO' : 'INATIVO';
    const alunoPorMatricula = new Map<number, string>();
    const matriculaPorId = new Map(matriculas.map((m) => [m.idMatricula, m]));

    // `User.email` é único, mas o JACAD repete e-mail entre matrículas
    // (irmãos, responsável no lugar do aluno, aluno com dois vínculos). Quem
    // chega primeiro fica com o endereço; os demais recebem um placeholder.
    // Ninguém perde acesso: o login de aluno é pelo RA.
    const donoDoEmail = new Map(
      (await this.prisma.user.findMany({ select: { email: true, matricula: true } })).map((u) => [
        u.email,
        u.matricula,
      ]),
    );

    const rasVistos = new Set<string>();

    for (const m of matriculas) {
      if (!m.ra || !m.aluno) continue;

      // E-mail institucional é o preferido; sem ele, o pessoal; sem nenhum,
      // um placeholder que impede login por e-mail até a secretaria corrigir.
      let email =
        m.alunoEmailInstitucional?.trim().toLowerCase() ||
        m.alunoEmail?.trim().toLowerCase() ||
        `${m.ra}@sem-email.insted.local`;

      const dono = donoDoEmail.get(email);
      if (dono && dono !== m.ra) {
        r.emailsDuplicados.push(`${m.ra} — ${email} já é de ${dono}`);
        email = `${m.ra}@sem-email.insted.local`;
      }
      donoDoEmail.set(email, m.ra);

      const aluno = await this.prisma.user.upsert({
        where: { matricula: m.ra },
        create: {
          matricula: m.ra,
          nome: nomeProprio(m.aluno),
          email,
          senhaHash: '', // definida no primeiro acesso
          role: 'ALUNO',
          status: statusDoAluno(m.ra),
        },
        update: {
          nome: nomeProprio(m.aluno),
          status: statusDoAluno(m.ra),
        },
      });
      alunoPorMatricula.set(m.idMatricula, aluno.id);
      r.matriculasProcessadas++;
      rasVistos.add(m.ra);

      const classId = m.idTurma ? turmaPorId.get(m.idTurma) : undefined;
      if (classId) {
        await this.prisma.enrollment.upsert({
          where: { studentId_classId: { studentId: aluno.id, classId } },
          create: { studentId: aluno.id, classId },
          update: { ativo: true },
        });
        r.matriculasTurma++;
      }
    }

    // ------------------------- 5. disciplinas + professores + alocações
    const linhas = await this.prisma.jacadMatriculaDisciplina.findMany({
      where: { idPeriodoLetivo, disciplina: { not: null } },
    });

    // Turno das turmas que ofertam disciplinas e modalidade dos cursos —
    // as duas fontes da modalidade de cada oferta.
    const turnoOfertante = new Map(
      (await this.prisma.jacadTurma.findMany({ select: { idTurma: true, turno: true } })).map(
        (t) => [t.idTurma, t.turno],
      ),
    );
    const modalidadeCurso = new Map(
      (await this.prisma.jacadCurso.findMany({ select: { idCursoBase: true, modalidade: true } })).map(
        (c) => [c.idCursoBase, c.modalidade],
      ),
    );

    // Conciliações já resolvidas: nome normalizado -> cadastro real.
    const conciliacoes = new Map(
      (await this.prisma.jacadDocenteConciliacao.findMany()).map((c) => [c.nomeNormalizado, c]),
    );

    const disciplinaPorNome = new Map<string, string>();
    /// Modalidade definida à mão por disciplina — entra na cadeia da oferta.
    const padraoDaDisciplina = new Map<string, Modalidade | null>();
    const professorPorNome = new Map<string, string>();
    const alocacaoPorChave = new Map<string, string>();
    /// Alocações já corrigidas no painel — a importação passa por cima delas.
    const edicoesManuais = new Set(
      (
        await this.prisma.teachingAssignment.findMany({
          where: { edicaoManual: true },
          select: { teacherId: true, subjectId: true, classId: true },
        })
      ).map((a) => `${a.teacherId}|${a.subjectId}|${a.classId}`),
    );
    const pendentes = new Set<string>();

    for (const l of linhas) {
      const nomeDisciplina = l.disciplina!;
      const chaveDisc = chaveNome(nomeDisciplina);
      const courseId = l.idCursoBase ? cursoPorId.get(l.idCursoBase) : undefined;

      // --- disciplina
      let subjectId = disciplinaPorNome.get(chaveDisc);
      if (!subjectId) {
        const codigo = codigoEstavel('JACAD-D-', chaveDisc);
        const subject = await this.prisma.subject.upsert({
          where: { codigo },
          create: { codigo, nome: nomeDisciplina, courseId },
          // `ativo` e `modalidadePadrao` ficam de fora: são decisão do painel.
          update: { nome: nomeDisciplina, courseId },
        });
        subjectId = subject.id;
        disciplinaPorNome.set(chaveDisc, subjectId);
        padraoDaDisciplina.set(subjectId, subject.modalidadePadrao);
        r.disciplinas++;
      }

      // --- professor
      //
      // A conciliação (comando `conciliar-docentes`) já casou o nome contra
      // /basicos/perfis. Quando ela deu certo, o docente entra com e-mail real
      // e ATIVO — e consegue acessar o próprio relatório. Quando não, entra
      // INATIVO com e-mail provisório e é reportado como pendente.
      if (!l.professor) continue;
      const chaveProf = chaveNome(l.professor);

      // Placeholder do JACAD: a oferta não gera alocação nem card de avaliação.
      if (ehPlaceholder(chaveProf)) {
        r.ofertasSemDocente++;
        continue;
      }
      let teacherId = professorPorNome.get(chaveProf);

      if (!teacherId) {
        const conc = conciliacoes.get(chaveProf);
        const resolvido =
          (conc?.status === 'CONCILIADO' || conc?.status === 'MANUAL') && Boolean(conc.email);

        const matricula = resolvido
          ? `JACAD-P-${conc!.idPerfil}`
          : codigoEstavel('JACAD-P-', chaveProf);

        let email = resolvido
          ? conc!.email!
          : `${matricula.toLowerCase()}@sem-email.insted.local`;

        // Mesma regra dos alunos: o e-mail é único no sistema.
        const donoAtual = donoDoEmail.get(email);
        if (donoAtual && donoAtual !== matricula) {
          r.emailsDuplicados.push(`${matricula} — ${email} já é de ${donoAtual}`);
          email = `${matricula.toLowerCase()}@sem-email.insted.local`;
        }
        donoDoEmail.set(email, matricula);

        const professor = await this.prisma.user.upsert({
          where: { matricula },
          create: {
            matricula,
            nome: nomeProprio(l.professor),
            email,
            cpf: conc?.cpf ?? null,
            senhaHash: '', // definida no primeiro acesso
            role: 'PROFESSOR',
            status: resolvido ? 'ATIVO' : 'INATIVO',
          },
          update: {
            nome: nomeProprio(l.professor),
            ...(resolvido ? { email, cpf: conc!.cpf ?? null, status: 'ATIVO' as const } : {}),
          },
        });

        teacherId = professor.id;
        professorPorNome.set(chaveProf, teacherId);
        r.professores++;
        if (resolvido) r.professoresConciliados++;
        else pendentes.add(`${nomeProprio(l.professor)} (${conc?.status ?? 'não conciliado'})`);
      }

      // --- alocação docente (professor × disciplina × turma × semestre)
      const matriculaAluno = matriculaPorId.get(l.idMatricula);
      const classId = matriculaAluno?.idTurma ? turmaPorId.get(matriculaAluno.idTurma) : undefined;
      if (!classId) continue;

      // A turma que oferta manda; sem sinal dela, a modalidade do curso.
      const modalidadeDaOferta = modalidade(
        l.idTurmaDisciplina ? (turnoOfertante.get(l.idTurmaDisciplina) ?? null) : null,
        l.idCursoBase ? (modalidadeCurso.get(l.idCursoBase) ?? null) : null,
        padraoDaDisciplina.get(subjectId) ?? null,
      );

      const chaveAloc = `${teacherId}|${subjectId}|${classId}`;
      let assignmentId = alocacaoPorChave.get(chaveAloc);

      if (!assignmentId) {
        const aloc = await this.prisma.teachingAssignment.upsert({
          where: {
            teacherId_subjectId_classId_termId: {
              teacherId,
              subjectId,
              classId,
              termId: term.id,
            },
          },
          create: {
            teacherId,
            subjectId,
            classId,
            termId: term.id,
            papel: 'titular',
            modalidade: modalidadeDaOferta,
          },
          // Alocação corrigida no painel não é tocada: reescrever `ativo` e
          // `modalidade` aqui desfaria a correção no próximo sync, e o
          // sintoma apareceria só quando o aluno recebesse o card errado.
          update: edicoesManuais.has(chaveAloc)
            ? {}
            : { ativo: true, modalidade: modalidadeDaOferta },
        });
        assignmentId = aloc.id;
        alocacaoPorChave.set(chaveAloc, assignmentId);
        r.alocacoes++;
      }

      // --- inscrição do aluno nesta alocação (cobre optativas e DP)
      const studentId = alunoPorMatricula.get(l.idMatricula);
      if (studentId) {
        await this.prisma.studentSubject.upsert({
          where: { studentId_assignmentId: { studentId, assignmentId } },
          create: { studentId, assignmentId },
          update: { ativo: true },
        });
        r.inscricoesDisciplina++;
      }
    }

    r.alunos = rasVistos.size;
    r.professoresPendentes = [...pendentes].sort();

    this.log(
      `Promovido: ${r.cursos} cursos · ${r.turmas} turmas · ${r.disciplinas} disciplinas · ` +
        `${r.alunos} alunos · ${r.professores} professores (${r.professoresConciliados} com e-mail) · ${r.alocacoes} alocações`,
    );

    return r;
  }
}
