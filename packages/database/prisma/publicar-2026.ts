/**
 * Publica os instrumentos de 2026 que têm respondente.
 *
 *   npm run homolog -- publicar-2026
 *
 * Deixa de fora, de propósito, os que ainda não têm como ser aplicados:
 * pós-graduação (o sistema não distingue pós-graduando de graduando) e
 * egressos (não têm matrícula ativa e não entram na geração de tarefas).
 * Publicar congela — congelar o que ainda vai mudar é perder a versão.
 */
import { PrismaClient } from '@prisma/client';
import { publicarFormulario } from '../src/formularios.js';

const prisma = new PrismaClient();

const COM_RESPONDENTE = [
  '2026 Avaliação Institucional — Discentes',
  '2026 Avaliação Institucional — Docentes',
  '2026 Avaliação Institucional — Técnico-Administrativo',
];

async function main(): Promise<void> {
  console.log('\nPublicando instrumentos de 2026\n');

  for (const nome of COM_RESPONDENTE) {
    const form = await prisma.formTemplate.findFirst({
      where: { nome },
      select: { id: true, status: true },
    });

    if (!form) {
      console.log(`⏭  ${nome}\n    não existe neste banco.\n`);
      continue;
    }
    if (form.status !== 'RASCUNHO') {
      console.log(`⏭  ${nome}\n    já está ${form.status.toLowerCase()}.\n`);
      continue;
    }

    const r = await publicarFormulario(prisma, form.id);
    console.log(`✅ ${r.nome}\n    ${r.blocos} blocos · ${r.questoes} questões · congelado\n`);
  }

  const rascunhos = await prisma.formTemplate.findMany({
    where: { status: 'RASCUNHO', nome: { startsWith: '2026' } },
    select: { nome: true },
  });
  if (rascunhos.length > 0) {
    console.log('Seguem em rascunho, à espera de decisão:');
    for (const r of rascunhos) console.log(`   · ${r.nome}`);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
