/**
 * Seed de desenvolvimento — Insted CPA
 *
 * Cria um recorte realista: 1 campus, 1 curso, 1 turma, 3 docentes, 5 alunos,
 * o questionário do aluno com 4 blocos e um período aberto — já com as
 * EvaluationTask e os EvaluationTaskTarget materializados.
 *
 * Rodar:  pnpm db:seed
 */
import { PrismaClient, Role, Shift, QuestionType, TargetType, FormAudience, FormStatus, PeriodStatus } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Trava de segurança: este seed APAGA usuários, cursos e turmas. Depois de
  // uma importação do JACAD isso destruiria milhares de registros reais — e o
  // `sync disciplinas` leva ~12 minutos para refazer.
  const importados = await prisma.jacadMatricula.count();
  if (importados > 0 && !process.env.SEED_FORCE) {
    console.error(
      `\n⛔ Abortado: existem ${importados} matrículas importadas do JACAD nesta base.\n` +
        '   Rodar o seed apagaria os dados reais.\n\n' +
        '   Se realmente quiser recomeçar do zero:  SEED_FORCE=1 npm run db:seed\n',
    );
    process.exitCode = 1;
    return;
  }

  console.log('🌱 Limpando base...');
  // Ordem importa: filhos antes dos pais.
  await prisma.$transaction([
    prisma.answerOption.deleteMany(),
    prisma.answer.deleteMany(),
    prisma.responseSet.deleteMany(),
    prisma.draftAnswer.deleteMany(),
    prisma.evaluationTaskTarget.deleteMany(),
    prisma.evaluationTask.deleteMany(),
    prisma.periodForm.deleteMany(),
    prisma.evaluationPeriod.deleteMany(),
    prisma.questionOption.deleteMany(),
    prisma.question.deleteMany(),
    prisma.questionBlock.deleteMany(),
    prisma.formTemplate.deleteMany(),
    prisma.studentSubject.deleteMany(),
    prisma.teachingAssignment.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.schoolClass.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.course.deleteMany(),
    prisma.academicTerm.deleteMany(),
    prisma.room.deleteMany(),
    prisma.department.deleteMany(),
    prisma.user.deleteMany(),
    prisma.campus.deleteMany(),
  ]);

  const senha = await hash('Insted@2026', 10);

  // ---------------------------------------------------------------- estrutura
  console.log('🏛️  Campus, departamentos e semestre letivo...');
  const campus = await prisma.campus.create({
    data: { nome: 'Insted — Campus Sede', sigla: 'SEDE', cidade: 'São Paulo' },
  });

  await prisma.department.createMany({
    data: [
      { nome: 'Biblioteca', sigla: 'BIB' },
      { nome: 'Secretaria Acadêmica', sigla: 'SEC' },
      { nome: 'Financeiro', sigla: 'FIN' },
      { nome: 'Tecnologia da Informação', sigla: 'TI' },
    ],
  });

  const term = await prisma.academicTerm.create({
    data: {
      codigo: '2026.1',
      ano: 2026,
      semestre: 1,
      inicioEm: new Date('2026-02-02'),
      fimEm: new Date('2026-06-30'),
      ativo: true,
    },
  });

  // ---------------------------------------------------------------- pessoas
  console.log('👥 Usuários...');
  const admin = await prisma.user.create({
    data: {
      nome: 'Coordenação CPA',
      email: 'cpa@insted.edu.br',
      matricula: 'ADM0001',
      senhaHash: senha,
      role: Role.ADMIN,
      senhaProvisoria: false,
      campusId: campus.id,
    },
  });

  const coordenador = await prisma.user.create({
    data: {
      nome: 'Marina Duarte',
      email: 'marina.duarte@insted.edu.br',
      matricula: 'DOC0100',
      senhaHash: senha,
      role: Role.GESTOR,
      senhaProvisoria: false,
      campusId: campus.id,
    },
  });

  const professores = await Promise.all(
    [
      ['Ana Lima', 'ana.lima@insted.edu.br', 'DOC0101'],
      ['Carlos Reis', 'carlos.reis@insted.edu.br', 'DOC0102'],
      ['Beatriz Nunes', 'beatriz.nunes@insted.edu.br', 'DOC0103'],
    ].map(([nome, email, matricula]) =>
      prisma.user.create({
        data: { nome, email, matricula, senhaHash: senha, role: Role.PROFESSOR, campusId: campus.id },
      }),
    ),
  );

  const alunos = await Promise.all(
    Array.from({ length: 5 }, (_, i) =>
      prisma.user.create({
        data: {
          nome: ['João Silva', 'Maria Souza', 'Pedro Alves', 'Júlia Costa', 'Rafael Dias'][i],
          email: `aluno${i + 1}@aluno.insted.edu.br`,
          matricula: `2026${String(i + 1).padStart(4, '0')}`,
          senhaHash: senha,
          role: Role.ALUNO,
          campusId: campus.id,
        },
      }),
    ),
  );

  // ---------------------------------------------------------------- acadêmico
  console.log('📚 Curso, disciplinas, turma e alocações...');
  const curso = await prisma.course.create({
    data: {
      nome: 'Análise e Desenvolvimento de Sistemas',
      codigo: 'ADS',
      grau: 'Tecnólogo',
      modalidade: 'Presencial',
      duracaoSemestres: 5,
      campusId: campus.id,
      coordenadorId: coordenador.id,
    },
  });

  const disciplinas = await Promise.all(
    [
      ['Banco de Dados', 'ADS-BD', 80],
      ['Engenharia de Software', 'ADS-ES', 80],
      ['Programação Web', 'ADS-PW', 80],
    ].map(([nome, codigo, ch]) =>
      prisma.subject.create({
        data: { nome: nome as string, codigo: codigo as string, cargaHoraria: ch as number, periodoGrade: 3, courseId: curso.id },
      }),
    ),
  );

  const sala = await prisma.room.create({
    data: { nome: 'Lab 204', bloco: 'B', capacidade: 45, tipo: 'laboratório', campusId: campus.id },
  });

  const turma = await prisma.schoolClass.create({
    data: {
      nome: 'ADS — 3º Semestre A',
      codigo: 'ADS-3A',
      courseId: curso.id,
      termId: term.id,
      turno: Shift.NOTURNO,
      periodo: 3,
    },
  });

  await prisma.enrollment.createMany({
    data: alunos.map((a) => ({ studentId: a.id, classId: turma.id })),
  });

  const alocacoes = await Promise.all(
    professores.map((prof, i) =>
      prisma.teachingAssignment.create({
        data: {
          teacherId: prof.id,
          subjectId: disciplinas[i].id,
          classId: turma.id,
          termId: term.id,
          roomId: sala.id,
          papel: 'titular',
        },
      }),
    ),
  );

  // ---------------------------------------------------------------- formulário
  console.log('📝 Questionário do aluno...');
  // Escala real usada no formulário discente de 2025 (Drive da CPA).
  // Não invente rótulos: os relatórios comparam com a série histórica, e os
  // colaboradores usam OUTRA escala ("Muito insuficiente… Excelente"), com
  // ponto médio diferente. Ver docs/06-questionarios-atuais.md.
  const LIKERT_DISCENTE = {
    min: 1,
    max: 5,
    labels: { '1': 'Ruim', '2': 'Regular', '3': 'Bom', '4': 'Muito bom', '5': 'Excelente' },
    permiteNaoSeAplica: true,
  };

  const form = await prisma.formTemplate.create({
    data: {
      nome: 'Avaliação Institucional — Discentes',
      descricao: 'Instrumento aplicado aos alunos de graduação.',
      publico: FormAudience.ALUNO,
      versao: 1,
      status: FormStatus.PUBLICADO,
      publicadoEm: new Date(),
      blocos: {
        create: [
          {
            // Itens 1 a 5 do formulário discente de 2025, na redação original.
            titulo: 'Bloco 1 — Infraestrutura',
            descricao: 'Instalações físicas e recursos disponíveis.',
            ordem: 1,
            targetType: TargetType.INFRAESTRUTURA,
            questoes: {
              create: [
                { enunciado: 'Como você avalia a infraestrutura das salas de aula (iluminação, ventilação, cadeiras, quadros, projetores, etc.)?', tipo: QuestionType.LIKERT, ordem: 1, config: LIKERT_DISCENTE },
                { enunciado: 'Como você avalia o acesso à biblioteca (física e/ou digital), em termos de acervo, espaço e recursos disponíveis?', tipo: QuestionType.LIKERT, ordem: 2, config: LIKERT_DISCENTE },
                { enunciado: 'Como você avalia a estrutura e os equipamentos dos laboratórios utilizados em seu curso (se aplicável)?', tipo: QuestionType.LIKERT, ordem: 3, config: LIKERT_DISCENTE },
                { enunciado: 'Como você avalia os espaços de convivência (cantina, banheiros, conectividade, etc.) da faculdade?', tipo: QuestionType.LIKERT, ordem: 4, config: LIKERT_DISCENTE },
                { enunciado: 'Considerando o ambiente geral da instituição (limpeza, sinalização, acessibilidade, segurança, manutenção), como você o avalia?', tipo: QuestionType.LIKERT, ordem: 5, config: LIKERT_DISCENTE },
              ],
            },
          },
          {
            titulo: 'Bloco 2 — Atendimento dos Setores',
            ordem: 2,
            targetType: TargetType.DEPARTAMENTO,
            repetivel: true,
            questoes: {
              create: [
                { enunciado: 'O atendimento deste setor é cordial e resolutivo.', tipo: QuestionType.LIKERT, ordem: 1, config: LIKERT_DISCENTE },
                { enunciado: 'O tempo de resposta é adequado.', tipo: QuestionType.LIKERT, ordem: 2, config: LIKERT_DISCENTE },
              ],
            },
          },
          {
            titulo: 'Bloco 3 — Curso e Coordenação',
            ordem: 3,
            targetType: TargetType.CURSO,
            questoes: {
              create: [
                { enunciado: 'A matriz curricular do curso é coerente com a formação pretendida.', tipo: QuestionType.LIKERT, ordem: 1, config: LIKERT_DISCENTE },
                { enunciado: 'A coordenação está acessível para atender os alunos.', tipo: QuestionType.LIKERT, ordem: 2, config: LIKERT_DISCENTE },
                { enunciado: 'Você recomendaria este curso a outra pessoa?', tipo: QuestionType.NPS, ordem: 3, config: { min: 0, max: 10 } },
                { enunciado: 'O que a coordenação poderia melhorar?', tipo: QuestionType.TEXTO_LIVRE, ordem: 4, obrigatoria: false, peso: 0, config: { maxLength: 500 } },
              ],
            },
          },
          {
            // Itens 6 a 10 do formulário de 2025 — MAS com uma diferença
            // importante: no instrumento atual eles são genéricos ("os
            // professores", no plural) e respondidos UMA vez. Aqui o bloco é
            // repetível, gerando uma nota por docente.
            //
            // Isso é mudança de política da CPA, não só de ferramenta. Enquanto
            // não houver decisão, dá para tornar o bloco não repetível e
            // reproduzir exatamente o instrumento antigo.
            // Ver docs/06-questionarios-atuais.md.
            titulo: 'Bloco 4 — Avaliação Docente',
            descricao: 'Responda para cada professor do seu semestre.',
            ordem: 4,
            targetType: TargetType.PROFESSOR_DISCIPLINA,
            repetivel: true,
            questoes: {
              create: [
                { enunciado: 'Como você avalia o domínio do conteúdo demonstrado pelo professor na disciplina?', tipo: QuestionType.LIKERT, ordem: 1, config: LIKERT_DISCENTE },
                { enunciado: 'Como você avalia a didática utilizada pelo professor para facilitar a compreensão dos conteúdos?', tipo: QuestionType.LIKERT, ordem: 2, config: LIKERT_DISCENTE },
                { enunciado: 'Como você avalia a articulação do professor com o ambiente virtual (AVA) para a promoção das aulas?', tipo: QuestionType.LIKERT, ordem: 3, config: LIKERT_DISCENTE },
                { enunciado: 'Como você avalia o comprometimento do professor com o processo de ensino-aprendizagem?', tipo: QuestionType.LIKERT, ordem: 4, config: LIKERT_DISCENTE },
                { enunciado: 'Comentários sobre este professor (opcional).', tipo: QuestionType.TEXTO_LIVRE, ordem: 5, obrigatoria: false, peso: 0, config: { maxLength: 500 } },
              ],
            },
          },
        ],
      },
    },
    include: { blocos: true },
  });

  // ---------------------------------------------------------------- período
  console.log('📅 Período de avaliação...');
  const periodo = await prisma.evaluationPeriod.create({
    data: {
      nome: 'Avaliação Institucional 2026.1',
      termId: term.id,
      status: PeriodStatus.ABERTO,
      abreEm: new Date('2026-05-04'),
      fechaEm: new Date('2026-05-30T23:59:59'),
      minimoRespostasExibicao: 5,
      mensagemBoasVindas: 'Sua opinião é anônima e ajuda a Insted a melhorar. Leva cerca de 5 minutos.',
      mensagemConclusao: 'Obrigado por participar! Os resultados serão divulgados pela CPA.',
      formularios: {
        create: [{ formId: form.id, publico: FormAudience.ALUNO, anonimo: true }],
      },
    },
    include: { formularios: true },
  });

  // ------------------------------------------------- materialização das tasks
  //
  // Este é o algoritmo central do sistema, aqui em versão simplificada.
  // Em produção vive em `apps/api/src/modules/tasks/task-generator.service.ts`
  // e roda como job na abertura do período.
  //
  console.log('⚙️  Gerando tasks e alvos...');
  const periodForm = periodo.formularios[0];
  const blocoDocente = form.blocos.find((b) => b.targetType === TargetType.PROFESSOR_DISCIPLINA)!;
  const blocosFixos = form.blocos.filter((b) => !b.repetivel);
  const departamentos = await prisma.department.findMany({ where: { ativo: true } });
  const blocoDepto = form.blocos.find((b) => b.targetType === TargetType.DEPARTAMENTO)!;

  for (const aluno of alunos) {
    // Alocações reais do aluno: pela matrícula na turma (fallback), ou pelas
    // inscrições explícitas em StudentSubject quando existirem.
    const minhasAlocacoes = await prisma.teachingAssignment.findMany({
      where: { classId: turma.id, termId: term.id, ativo: true },
      include: { teacher: true, subject: true },
    });

    const alvos: {
      blockId: string;
      targetType: TargetType;
      targetRefId: string | null;
      rotulo: string;
      subtitulo?: string;
      ordem: number;
    }[] = [];

    let ordem = 0;

    for (const bloco of blocosFixos) {
      alvos.push({
        blockId: bloco.id,
        targetType: bloco.targetType,
        targetRefId: bloco.targetType === TargetType.CURSO ? curso.id : null,
        rotulo: bloco.targetType === TargetType.CURSO ? curso.nome : 'Insted — Campus Sede',
        ordem: ordem++,
      });
    }

    for (const dep of departamentos) {
      alvos.push({
        blockId: blocoDepto.id,
        targetType: TargetType.DEPARTAMENTO,
        targetRefId: dep.id,
        rotulo: dep.nome,
        ordem: ordem++,
      });
    }

    for (const aloc of minhasAlocacoes) {
      alvos.push({
        blockId: blocoDocente.id,
        targetType: TargetType.PROFESSOR_DISCIPLINA,
        targetRefId: aloc.id,
        rotulo: aloc.teacher.nome,
        subtitulo: aloc.subject.nome,
        ordem: ordem++,
      });
    }

    await prisma.evaluationTask.create({
      data: {
        periodId: periodo.id,
        periodFormId: periodForm.id,
        respondentId: aluno.id,
        alvos: { create: alvos },
      },
    });
  }

  console.log(`
✅ Seed concluído.

   Admin CPA .... cpa@insted.edu.br        / Insted@2026
   Coordenação .. marina.duarte@insted.edu.br / Insted@2026
   Professor .... ana.lima@insted.edu.br    / Insted@2026
   Aluno ........ 20260001                  / Insted@2026

   ${alunos.length} tasks geradas, ${ordem} alvos por aluno.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
