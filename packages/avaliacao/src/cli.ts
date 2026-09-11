/**
 * CLI do ciclo de avaliação.
 *
 *   npm run alvos -- gerar --periodo=<id>       gera tarefas e alvos
 *   npm run alvos -- incluir --periodo=<id> [--ra=A,B]
 *                                               acrescenta quem ficou de fora
 *   npm run alvos -- previa --ra=<RA>           o que ESTE aluno vai ver
 *   npm run alvos -- periodos                   ciclos cadastrados
 */
import './env.js'; // antes de qualquer leitura de process.env
import { PrismaClient } from '@prisma/client';
import { GeradorDeAlvos } from './gerar-alvos.js';

const prisma = new PrismaClient();
const log = (m: string) => console.log(m);

function opcoes(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) o[m[1]] = m[2];
  }
  return o;
}

async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  const o = opcoes(resto);

  switch (comando) {
    case 'periodos': {
      const ps = await prisma.evaluationPeriod.findMany({
        include: { term: true, semestres: { include: { term: true } }, _count: { select: { tarefas: true } } },
        orderBy: { criadoEm: 'desc' },
      });
      if (ps.length === 0) return log('Nenhum período de avaliação cadastrado.');
      for (const p of ps) {
        const sems =
          p.semestres.length > 0
            ? p.semestres.map((s) => s.term.codigo).join(' + ')
            : p.term.codigo;
        log(`\n  ${p.nome}`);
        log(`    id ......... ${p.id}`);
        log(`    status ..... ${p.status}`);
        log(`    semestres .. ${sems}`);
        log(`    tarefas .... ${p._count.tarefas}`);
      }
      return;
    }

    case 'gerar': {
      const periodId = o.periodo;
      if (!periodId) throw new Error('Informe --periodo=<id>. Veja com: npm run alvos -- periodos');

      const r = await new GeradorDeAlvos(prisma, log).gerar(periodId);

      log('\n─────────────────────────────────────');
      log(`  semestres ............ ${r.semestresAbrangidos.join(', ')}`);
      log(`  tarefas geradas ...... ${r.tarefas}`);
      log(`  alvos gerados ........ ${r.alvos}`);
      log(`  média por aluno ...... ${r.tarefas ? (r.alvos / r.tarefas).toFixed(1) : '—'}`);
      log('─────────────────────────────────────');
      for (const a of r.avisos) log(`\n⚠  ${a}`);
      return;
    }

    /**
     * Inclusão com o ciclo aberto — mesma regra do botão da tela de
     * respondentes, para quando o volume passa do que cabe numa requisição.
     */
    case 'incluir': {
      const periodId = o.periodo;
      if (!periodId) throw new Error('Informe --periodo=<id>. Veja com: npm run alvos -- periodos');
      const ras = o.ra ? o.ra.split(',').map((x) => x.trim()).filter(Boolean) : undefined;

      const r = await new GeradorDeAlvos(prisma, log).incluir(periodId, ras);

      log('\n─────────────────────────────────────');
      log(`  incluídos ............ ${r.incluidos.length}`);
      log(`  cards criados ........ ${r.alvos}`);
      log(`  não incluídos ........ ${r.recusados.length}`);
      log('─────────────────────────────────────');
      for (const p of r.incluidos.slice(0, 50)) log(`  + ${p.matricula}  ${p.nome}  (${p.cards} cards)`);
      for (const p of r.recusados.slice(0, 50)) {
        log(`  − ${p.matricula}  ${p.nome ?? ''} — ${p.motivo}`);
      }
      return;
    }

    /** Mostra exatamente o questionário que um aluno receberia. */
    case 'previa': {
      const ra = o.ra;
      if (!ra) throw new Error('Informe --ra=<matrícula do aluno>.');

      const aluno = await prisma.user.findUnique({
        where: { matricula: ra },
        select: { id: true, nome: true, matricula: true },
      });
      if (!aluno) throw new Error(`Aluno ${ra} não encontrado.`);

      log(`\n  ${aluno.nome}  (RA ${aluno.matricula})\n`);

      const ofertas = await prisma.studentSubject.findMany({
        where: { studentId: aluno.id, ativo: true },
        select: {
          assignment: {
            select: {
              modalidade: true,
              term: { select: { codigo: true } },
              subject: { select: { nome: true } },
              teacher: { select: { nome: true } },
            },
          },
        },
      });

      log('  DISCIPLINAS CURSADAS');
      log('  semestre  modalidade      disciplina / professor');
      log('  ────────  ──────────────  ──────────────────────');
      for (const { assignment: a } of ofertas.sort((x, y) =>
        (x.assignment.term.codigo + x.assignment.subject.nome).localeCompare(
          y.assignment.term.codigo + y.assignment.subject.nome,
        ),
      )) {
        log(
          `  ${a.term.codigo.padEnd(8)}  ${a.modalidade.padEnd(14)}  ${a.subject.nome.slice(0, 40)} — ${a.teacher.nome.slice(0, 24)}`,
        );
      }

      const tarefas = await prisma.evaluationTask.findMany({
        where: { respondentId: aluno.id },
        include: {
          period: { select: { nome: true } },
          alvos: { orderBy: { ordem: 'asc' } },
        },
      });

      if (tarefas.length === 0) {
        log('\n  Nenhuma tarefa gerada ainda para este aluno.');
        return;
      }

      for (const t of tarefas) {
        log(`\n  TAREFA — ${t.period.nome}  [${t.status}]`);
        log(`  ${t.alvos.length} cards no wizard:\n`);
        for (const alvo of t.alvos) {
          const sub = alvo.subtitulo ? ` — ${alvo.subtitulo}` : '';
          log(`    ${String(alvo.ordem + 1).padStart(3)}. [${alvo.targetType}] ${alvo.rotulo}${sub}`);
        }
      }
      return;
    }

    default:
      log(`Comandos:
  periodos                     lista os ciclos de avaliação
  gerar --periodo=<id>         gera tarefas e alvos do ciclo
  previa --ra=<matrícula>      mostra o que um aluno específico receberá`);
      process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
