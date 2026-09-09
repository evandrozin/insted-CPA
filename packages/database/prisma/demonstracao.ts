/**
 * Massa sintética para homologação.
 *
 *   npm run homolog -- demo
 *
 * Cria uma estrutura acadêmica pequena e inteiramente fictícia: dois semestres
 * de 2026, um curso presencial, um a distância, professores, disciplinas e
 * alunos. O suficiente para criar um ciclo, gerar as tarefas e responder o
 * questionário de ponta a ponta.
 *
 * Existe para não precisar importar o JACAD em homologação. A importação real
 * traria 1.780 alunos com nome, e-mail e CPF para um ambiente de teste — dado
 * pessoal de gente de verdade num lugar com menos cuidado que produção, para
 * validar tela. Aqui os nomes são inventados e assumidamente ridículos, para
 * que ninguém confunda com cadastro real ao olhar a listagem.
 *
 * Cobre as duas modalidades de propósito: é o que exercita os dois blocos de
 * professor do instrumento de 2026 e prova que o aluno EAD recebe as perguntas
 * do AVA e o presencial as de laboratório.
 *
 * Recusa rodar se houver dado do JACAD no banco.
 */
import { PrismaClient, type Modalidade, type Shift } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();
const log = (m = '') => console.log(m);

const CAMPUS = { nome: 'Campus Demonstração', sigla: 'DEMO', cidade: 'Cidade Fictícia' };

const DEPARTAMENTOS = [
  { nome: 'Biblioteca', sigla: 'BIB' },
  { nome: 'Secretaria Acadêmica', sigla: 'SEC' },
  { nome: 'Tecnologia da Informação', sigla: 'TI' },
  { nome: 'Financeiro', sigla: 'FIN' },
];

const CURSOS = [
  {
    nome: 'Odontologia (demonstração)',
    codigo: 'DEMO-ODO',
    modalidade: 'Presencial',
    modalidadeEnum: 'PRESENCIAL' as Modalidade,
    turno: 'MATUTINO' as Shift,
    disciplinas: [
      'Anatomia de Cabeça e Pescoço',
      'Bioquímica Geral e Aplicada',
      'Histologia Oral',
      'Radiologia Odontológica',
    ],
  },
  {
    nome: 'Gestão Comercial (demonstração)',
    codigo: 'DEMO-GCO',
    modalidade: 'EAD',
    modalidadeEnum: 'EAD' as Modalidade,
    turno: 'EAD' as Shift,
    disciplinas: [
      'Fundamentos de Marketing',
      'Comportamento do Consumidor',
      'Gestão de Vendas',
      'Estatística Aplicada',
    ],
  },
];

/** Nomes inventados — nenhum corresponde a pessoa real da instituição. */
const DOCENTES = [
  'Aurora Bastos Verdemar',
  'Teodoro Quintanilha Sol',
  'Íris Lobo Trigueiro',
  'Rafael Mendes Cavalcanti',
  'Nadir Prado Escalante',
  'Otávio Serrano Belmonte',
];

const ALUNOS = [
  'Beatriz Almeida Rocha',
  'Caio Nogueira Prado',
  'Daniela Furtado Reis',
  'Emanuel Tavares Pinho',
  'Fernanda Quirino Sales',
  'Gustavo Bittencourt Naves',
  'Helena Vasques Moreira',
  'Ígor Salazar Fontes',
];

const SEMESTRES = [
  { codigo: '2026.1', ano: 2026, semestre: 1, inicio: '2026-02-02', fim: '2026-06-30', ativo: false },
  { codigo: '2026.2', ano: 2026, semestre: 2, inicio: '2026-08-01', fim: '2026-12-15', ativo: true },
];

async function main(): Promise<void> {
  const jacad = await prisma.jacadMatricula.count().catch(() => 0);
  if (jacad > 0) {
    log('\n❌ Este banco tem dados importados do JACAD.\n');
    log('   A massa de demonstração é para ambiente sem dado real. Abortando\n');
    log('   para não misturar cadastro fictício com cadastro de gente.\n');
    process.exitCode = 1;
    return;
  }

  log('\nMassa de demonstração — nomes fictícios\n');

  const campus = await prisma.campus.upsert({
    where: { sigla: CAMPUS.sigla },
    create: CAMPUS,
    update: { nome: CAMPUS.nome },
  });

  // Chave natural, não id: a sigla é única, e o seed dos formulários de 2025
  // já pode ter criado estes setores. Usar id inventado colidiria com eles.
  for (const d of DEPARTAMENTOS) {
    await prisma.department.upsert({
      where: { sigla: d.sigla },
      create: d,
      update: { nome: d.nome },
    });
  }
  const setores = await prisma.department.count({ where: { ativo: true } });
  log(`  ${setores} setores`);

  const terms = [];
  for (const s of SEMESTRES) {
    terms.push(
      await prisma.academicTerm.upsert({
        where: { codigo: s.codigo },
        create: {
          codigo: s.codigo,
          ano: s.ano,
          semestre: s.semestre,
          inicioEm: new Date(s.inicio),
          fimEm: new Date(s.fim),
          ativo: s.ativo,
        },
        update: { ativo: s.ativo },
      }),
    );
  }
  log(`  ${terms.length} semestres letivos: ${terms.map((t) => t.codigo).join(', ')}`);

  // Senha vazia: quem for entrar usa o primeiro acesso com matrícula + e-mail,
  // o mesmo caminho do aluno importado.
  const semSenha = { senhaHash: '', senhaProvisoria: false };

  const docentes = [];
  for (const [i, nome] of DOCENTES.entries()) {
    const matricula = `DEMO-P${String(i + 1).padStart(3, '0')}`;
    docentes.push(
      await prisma.user.upsert({
        where: { matricula },
        create: {
          matricula,
          nome,
          email: `${matricula.toLowerCase()}@demo.insted.local`,
          role: 'PROFESSOR',
          status: 'ATIVO',
          criadoManualmente: true,
          ...semSenha,
        },
        update: { nome },
      }),
    );
  }
  log(`  ${docentes.length} docentes`);

  let totalDisciplinas = 0;
  let totalOfertas = 0;
  const turmasAtuais: string[] = [];

  for (const c of CURSOS) {
    const curso = await prisma.course.upsert({
      where: { codigo: c.codigo },
      create: {
        codigo: c.codigo,
        nome: c.nome,
        modalidade: c.modalidade,
        campusId: campus.id,
        ativo: true,
      },
      update: { nome: c.nome, modalidade: c.modalidade },
    });

    const disciplinas = [];
    for (const [i, nome] of c.disciplinas.entries()) {
      const codigo = `${c.codigo}-D${i + 1}`;
      disciplinas.push(
        await prisma.subject.upsert({
          where: { codigo },
          create: {
            codigo,
            nome,
            courseId: curso.id,
            ativo: true,
            modalidadePadrao: c.modalidadeEnum,
          },
          update: { nome, modalidadePadrao: c.modalidadeEnum },
        }),
      );
      totalDisciplinas++;
    }

    for (const term of terms) {
      const codigoTurma = `${c.codigo}-${term.codigo}`;
      const turma = await prisma.schoolClass.upsert({
        // Turma é única por (código, semestre): o mesmo código se repete de um
        // semestre para o outro.
        where: { codigo_termId: { codigo: codigoTurma, termId: term.id } },
        create: {
          codigo: codigoTurma,
          nome: `${c.nome} — ${term.codigo}`,
          courseId: curso.id,
          termId: term.id,
          turno: c.turno,
          periodo: term.semestre,
          ativo: true,
        },
        update: {},
      });

      if (term.codigo === '2026.2') turmasAtuais.push(turma.id);

      // Duas disciplinas por semestre: o aluno avalia quatro professores no
      // ano, que é o que dá para conferir sem rolar a tela até cansar.
      const doSemestre = term.semestre === 1 ? disciplinas.slice(0, 2) : disciplinas.slice(2);

      for (const [i, disciplina] of doSemestre.entries()) {
        const docente = docentes[(CURSOS.indexOf(c) * 3 + i + term.semestre) % docentes.length];
        const id = `demo-of-${disciplina.codigo}-${term.codigo}`;
        await prisma.teachingAssignment.upsert({
          where: { id },
          create: {
            id,
            teacherId: docente.id,
            subjectId: disciplina.id,
            classId: turma.id,
            termId: term.id,
            modalidade: c.modalidadeEnum,
            ativo: true,
          },
          update: { modalidade: c.modalidadeEnum },
        });
        totalOfertas++;
      }
    }
  }
  log(`  ${totalDisciplinas} disciplinas · ${totalOfertas} ofertas (presencial e EAD)`);

  // Alunos: metade em cada curso, matriculados na turma de 2026.2 e inscritos
  // nas ofertas dos DOIS semestres — é assim que o ciclo anual funciona.
  let totalInscricoes = 0;
  for (const [i, nome] of ALUNOS.entries()) {
    const matricula = `DEMO${String(2026000 + i + 1)}`;
    const curso = CURSOS[i % CURSOS.length];

    const aluno = await prisma.user.upsert({
      where: { matricula },
      create: {
        matricula,
        nome,
        email: `${matricula.toLowerCase()}@demo.insted.local`,
        role: 'ALUNO',
        status: 'ATIVO',
        criadoManualmente: true,
        ...semSenha,
      },
      update: { nome },
    });

    const turmas = await prisma.schoolClass.findMany({
      where: { codigo: { startsWith: curso.codigo } },
      select: { id: true, termId: true, codigo: true },
    });

    for (const turma of turmas) {
      if (turma.codigo.endsWith('2026.2')) {
        await prisma.enrollment.upsert({
          where: { studentId_classId: { studentId: aluno.id, classId: turma.id } },
          create: { studentId: aluno.id, classId: turma.id, ativo: true },
          update: { ativo: true },
        });
      }

      const ofertas = await prisma.teachingAssignment.findMany({
        where: { classId: turma.id },
        select: { id: true },
      });
      for (const oferta of ofertas) {
        await prisma.studentSubject.upsert({
          where: { studentId_assignmentId: { studentId: aluno.id, assignmentId: oferta.id } },
          create: { studentId: aluno.id, assignmentId: oferta.id, ativo: true },
          update: { ativo: true },
        });
        totalInscricoes++;
      }
    }
  }
  log(`  ${ALUNOS.length} alunos · ${totalInscricoes} inscrições em disciplina`);

  // Um técnico-administrativo, para o instrumento dele ter respondente.
  const senhaTecnico = 'demo-tecnico-2026';
  await prisma.user.upsert({
    where: { matricula: 'DEMO-TEC001' },
    create: {
      matricula: 'DEMO-TEC001',
      nome: 'Zulmira Andrade Peixoto',
      email: 'demo-tec001@demo.insted.local',
      role: 'TECNICO_ADMIN',
      status: 'ATIVO',
      criadoManualmente: true,
      senhaHash: await hash(senhaTecnico, 12),
      senhaProvisoria: true,
    },
    update: {},
  });
  log('  1 técnico-administrativo');

  log('\n─────────────────────────────────────────────────');
  log('  Agora dá para criar o ciclo em Avaliação → Ciclos anuais:');
  log('  escolha 2026, vincule os dois semestres e os formulários,');
  log('  gere os alvos e abra.');
  log('');
  log(`  Para entrar como aluno: matrícula DEMO2026001 + o e-mail dela,`);
  log('  pelo "Primeiro acesso" da tela de login.');
  log('');
  log('  Todos os nomes são fictícios. Nenhum dado real foi usado.');
  log('─────────────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
