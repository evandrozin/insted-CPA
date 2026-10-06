/**
 * Aluno descartável, com ciclo e matrícula, para testar a tela de resposta.
 *
 *   npm run db:aluno-teste                cria
 *   npm run db:aluno-teste -- limpar      remove
 *   npm run db:aluno-teste -- --form="2026 Avaliação Institucional — Discentes"
 *
 * Testar o que o aluno vê exige um aluno: matrícula numa turma, disciplinas
 * vinculadas e tarefa gerada. Montar isso à mão a cada verificação é repetição
 * — e repetição é o que faz a verificação deixar de ser feita.
 *
 * SÓ RODA EM BANCO LOCAL, e cria gente que não existe. Num banco com alunos
 * reais, isso seria uma pessoa inventada recebendo avaliação.
 */
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

const MATRICULA = 'aluno-teste';
const EMAIL = 'aluno-teste@exemplo.local';
const SENHA = 'aluno de teste 2026';
const CICLO = 'TESTE — tela do aluno';

function exigirBancoLocal(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!/@(localhost|127\.0\.0\.1|host\.docker\.internal)[:/]/.test(url)) {
    throw new Error('Isto só roda em banco local: cria um aluno que não existe.');
  }
}

async function limpar(): Promise<void> {
  const ciclo = await prisma.evaluationPeriod.findFirst({ where: { nome: CICLO } });
  if (ciclo) await prisma.evaluationPeriod.delete({ where: { id: ciclo.id } });

  const aluno = await prisma.user.findFirst({ where: { matricula: MATRICULA } });
  if (aluno) await prisma.user.delete({ where: { id: aluno.id } });

  console.log('🧹 aluno e ciclo de teste removidos');
}

async function criar(): Promise<void> {
  const pedido = process.argv.find((a) => a.startsWith('--form='))?.slice(7);

  // Entre versões do mesmo nome, a mais nova; e rascunho antes de publicado,
  // porque é no rascunho que dá para mexer enquanto se testa.
  const form = (
    await prisma.formTemplate.findMany({
      where: {
        publico: 'ALUNO',
        ...(pedido ? { nome: { contains: pedido } } : { status: 'RASCUNHO' }),
      },
      orderBy: [{ versao: 'desc' }, { criadoEm: 'desc' }],
    })
  ).sort((a, b) => Number(b.status === 'RASCUNHO') - Number(a.status === 'RASCUNHO'))[0];
  if (!form) throw new Error(`Formulário não encontrado${pedido ? `: ${pedido}` : ''}.`);

  // Turma com oferta presencial: é o que faz o bloco repetível por professor
  // gerar card. Sem isso, o teste não cobre a parte mais complexa da tela.
  const oferta = await prisma.teachingAssignment.findFirst({
    where: { modalidade: { in: ['PRESENCIAL', 'SEMIPRESENCIAL'] }, ativo: true },
    select: { classId: true, termId: true, class: { select: { nome: true } } },
    orderBy: { criadoEm: 'asc' },
  });
  if (!oferta) throw new Error('Nenhuma oferta presencial no banco local.');

  await limpar();

  const aluno = await prisma.user.create({
    data: {
      nome: 'Aluno de Teste',
      email: EMAIL,
      matricula: MATRICULA,
      role: 'ALUNO',
      status: 'ATIVO',
      senhaHash: await hash(SENHA, 10),
      senhaProvisoria: false,
      criadoManualmente: true,
      matriculas: { create: { classId: oferta.classId } },
    },
  });

  // As ofertas do aluno vêm de StudentSubject, não da turma.
  const ofertas = await prisma.teachingAssignment.findMany({
    where: {
      classId: oferta.classId,
      modalidade: { in: ['PRESENCIAL', 'SEMIPRESENCIAL'] },
      ativo: true,
    },
    select: { id: true },
  });
  await prisma.studentSubject.createMany({
    data: ofertas.map((o) => ({ studentId: aluno.id, assignmentId: o.id })),
  });

  const agora = new Date();
  const ciclo = await prisma.evaluationPeriod.create({
    data: {
      nome: CICLO,
      descricao: 'Cenário de verificação. Remova com: npm run db:aluno-teste -- limpar',
      ano: 2026,
      termId: oferta.termId,
      status: 'ABERTO',
      abreEm: new Date(agora.getTime() - 86_400_000),
      fechaEm: new Date(agora.getTime() + 7 * 86_400_000),
      formularios: { create: { formId: form.id, publico: 'ALUNO' } },
    },
  });

  console.log('');
  console.log(`formulário .. ${form.nome}`);
  console.log(`turma ....... ${oferta.class.nome} (${ofertas.length} disciplinas)`);
  console.log(`matrícula ... ${MATRICULA}`);
  console.log(`senha ....... ${SENHA}`);
  console.log('');
  console.log('Falta gerar os cards (o gerador vive em @insted/avaliacao):');
  console.log('');
  console.log(`  cd ../avaliacao && npm run alvos -- incluir --periodo=${ciclo.id} --ra=${MATRICULA}`);
  console.log('');
}

async function main(): Promise<void> {
  exigirBancoLocal();
  await (process.argv.includes('limpar') ? limpar() : criar());
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
