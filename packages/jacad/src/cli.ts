/**
 * CLI da integração JACAD.
 *
 * Equivalente aos comandos `php artisan jacad:*` do Insted Hub Digital.
 * Rode da raiz do monorepo:
 *
 *   npm run jacad -- testar
 *   npm run jacad -- testar-sso --ra=2023104129
 *   npm run jacad -- sync periodos
 *   npm run jacad -- sync cursos
 *   npm run jacad -- sync turmas --ano=2026
 *   npm run jacad -- sync matriculas --periodo=38
 *   npm run jacad -- sync disciplinas --periodo=38 [--curso=5]
 *   npm run jacad -- sync tudo --periodo=38
 *   npm run jacad -- promover --periodo=38
 *
 * O passo `disciplinas` é lento (1 chamada por matrícula) e exige IP liberado
 * no JACAD — rode da máquina autorizada.
 */
import './env.js'; // deve vir antes de qualquer leitura de process.env
import { PrismaClient, type JacadRecurso } from '@prisma/client';
import { clienteDoAmbiente, JacadError } from './client.js';
import { JacadIngest } from './ingest.js';
import { JacadPromotor } from './promover.js';
import { verificar } from './verificar.js';
import { sondarDocentes } from './sondar-docentes.js';
import { sondarPerfis } from './sondar-perfis.js';
import { ConciliadorDocentes } from './conciliar-docentes.js';
import { simularConciliacao } from './simular-conciliacao.js';
import { sondarLogin } from './sondar-login.js';
import { testarSso } from './testar-sso.js';

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

function exigirPeriodo(o: Record<string, string>): number {
  const p = Number(o.periodo);
  if (!p) {
    throw new Error(
      'Informe --periodo=<idPeriodoLetivo>. Veja os ids com: npm run jacad -- periodos',
    );
  }
  return p;
}

/** Envolve uma sincronização com registro em jacad_sync_logs. */
async function comLog(
  recurso: JacadRecurso,
  referencia: string | null,
  fn: () => Promise<number>,
): Promise<void> {
  const reg = await prisma.jacadSyncLog.create({
    data: { recurso, referencia, status: 'EXECUTANDO' },
  });

  try {
    const total = await fn();
    await prisma.jacadSyncLog.update({
      where: { id: reg.id },
      data: { status: 'CONCLUIDO', totalRegistros: total, concluidoEm: new Date() },
    });
    log(`\n✅ ${recurso}: ${total} registros (log ${reg.id.slice(0, 8)})`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.jacadSyncLog.update({
      where: { id: reg.id },
      data: { status: 'FALHOU', erros: 1, mensagem: msg.slice(0, 1000), concluidoEm: new Date() },
    });
    throw e;
  }
}

async function main() {
  const [comando, sub, ...resto] = process.argv.slice(2);
  const o = opcoes([sub ?? '', ...resto]);

  // Preguiçoso de propósito: `jacad` sem argumentos e `jacad periodos` não
  // falam com a API, e devem funcionar mesmo sem JACAD_TOKEN configurado.
  const clientes = () => {
    const jacad = clienteDoAmbiente();
    return { jacad, ingest: new JacadIngest(prisma, jacad, log) };
  };

  switch (comando) {
    case 'testar': {
      const r = await clientes().jacad.testarConexao();
      log(r.ok ? `✅ ${r.mensagem}` : `❌ (HTTP ${r.status}) ${r.mensagem}`);
      process.exitCode = r.ok ? 0 : 1;
      return;
    }

    case 'verificar':
      // Diagnóstico de leitura: não grava nada e não precisa do banco.
      return verificar(clientes().jacad);

    case 'sondar-docentes':
      return sondarDocentes(clientes().jacad, exigirPeriodo(o), o.amostra ? Number(o.amostra) : 25);

    case 'sondar-login':
      // Descobre se o JACAD valida credencial de aluno (não grava nada).
      return sondarLogin(clientes().jacad);

    case 'testar-sso': {
      // Teste de integração: exige o CPA no ar e grava um SSO_LOGIN real.
      if (!o.ra) throw new Error('Informe --ra=<matrícula do aluno>.');
      return testarSso(clientes().jacad, o.ra, o.cpa ?? 'http://localhost:3000');
    }

    case 'sondar-perfis':
      return sondarPerfis(clientes().jacad, o.nome ?? 'SILVA');

    case 'periodos': {
      const ps = await prisma.jacadPeriodoLetivo.findMany({
        orderBy: [{ ano: 'desc' }, { semestre: 'desc' }],
        take: 20,
      });
      if (ps.length === 0) return log('Staging vazio. Rode: npm run jacad -- sync periodos');
      log('\n  id  ano.sem  descrição');
      log('  ──  ───────  ─────────');
      for (const p of ps) {
        log(`  ${String(p.idPeriodoLetivo).padStart(3)}  ${p.ano}.${p.semestre}   ${p.descricao ?? ''}`);
      }
      return;
    }

    case 'sync': {
      switch (sub) {
        case 'periodos':
          return comLog('PERIODOS_LETIVOS', null, () => clientes().ingest.sincronizarPeriodosLetivos());

        case 'cursos':
          return comLog('CURSOS', null, () => clientes().ingest.sincronizarCursos());

        case 'turmas': {
          const ano = o.ano ? Number(o.ano) : undefined;
          return comLog('TURMAS', ano ? `ano=${ano}` : null, () => clientes().ingest.sincronizarTurmas(ano));
        }

        case 'matriculas': {
          const periodo = exigirPeriodo(o);
          return comLog('MATRICULAS', `periodo=${periodo}`, () =>
            clientes().ingest.sincronizarMatriculas(periodo),
          );
        }

        case 'disciplinas': {
          const periodo = exigirPeriodo(o);
          const curso = o.curso ? Number(o.curso) : undefined;
          return comLog(
            'MATRICULA_DISCIPLINA',
            `periodo=${periodo}${curso ? ` curso=${curso}` : ''}`,
            () => clientes().ingest.sincronizarMatriculaDisciplinas(periodo, curso),
          );
        }

        case 'tudo': {
          const periodo = exigirPeriodo(o);
          log('→ períodos letivos');
          await comLog('PERIODOS_LETIVOS', null, () => clientes().ingest.sincronizarPeriodosLetivos());
          log('\n→ cursos');
          await comLog('CURSOS', null, () => clientes().ingest.sincronizarCursos());
          log('\n→ turmas');
          await comLog('TURMAS', null, () => clientes().ingest.sincronizarTurmas());
          log('\n→ matrículas');
          await comLog('MATRICULAS', `periodo=${periodo}`, () =>
            clientes().ingest.sincronizarMatriculas(periodo),
          );
          log('\n→ disciplinas (lento)');
          await comLog('MATRICULA_DISCIPLINA', `periodo=${periodo}`, () =>
            clientes().ingest.sincronizarMatriculaDisciplinas(periodo),
          );
          log('\nStaging completo. Agora: npm run jacad -- promover --periodo=' + periodo);
          return;
        }

        default:
          throw new Error(
            'Recurso inválido. Use: periodos | cursos | turmas | matriculas | disciplinas | tudo',
          );
      }
    }

    case 'simular-conciliacao':
      // Diagnóstico: mede a taxa de casamento sem gravar nada.
      return simularConciliacao(
        clientes().jacad,
        exigirPeriodo(o),
        o.amostra ? Number(o.amostra) : 40,
      );

    case 'conciliar-docentes': {
      const periodo = o.periodo ? Number(o.periodo) : undefined;
      const c = new ConciliadorDocentes(prisma, clientes().jacad, log);
      const r = await c.conciliar(periodo);
      log('\n─────────────────────────────────────');
      log(`  docentes ............. ${r.total}`);
      log(`  conciliados .......... ${r.conciliados}`);
      log(`  ambíguos ............. ${r.ambiguos}`);
      log(`  não encontrados ...... ${r.naoEncontrados}`);
      if (r.semEmail > 0) log(`  conciliados sem e-mail  ${r.semEmail}`);
      log('─────────────────────────────────────');
      if (r.ambiguos + r.naoEncontrados > 0) {
        log('\n  Resolva os pendentes antes de promover: eles entram INATIVOS');
        log('  e não conseguem acessar o próprio relatório.');
      }
      return;
    }

    case 'promover': {
      const periodo = exigirPeriodo(o);
      const r = await new JacadPromotor(prisma, log).promover(periodo);

      log('\n─────────────────────────────────────');
      log(`  cursos ................ ${r.cursos}`);
      log(`  turmas ................ ${r.turmas}`);
      log(`  disciplinas ........... ${r.disciplinas}`);
      log(`  alunos ................ ${r.alunos} (em ${r.matriculasProcessadas} matrículas)`);
      log(`  professores ........... ${r.professores}`);
      log(`  alocações docentes .... ${r.alocacoes}`);
      log(`  matrículas em turma ... ${r.matriculasTurma}`);
      log(`  inscrições disciplina . ${r.inscricoesDisciplina}`);
      log('─────────────────────────────────────');

      if (r.emailsDuplicados.length > 0) {
        log(
          `\n⚠  ${r.emailsDuplicados.length} cadastros compartilhavam e-mail com outro.\n` +
            '   Cada um ficou com um endereço provisório; o acesso continua pelo RA.\n',
        );
        for (const e of r.emailsDuplicados.slice(0, 10)) log(`     · ${e}`);
        if (r.emailsDuplicados.length > 10) {
          log(`     … e mais ${r.emailsDuplicados.length - 10}`);
        }
      }

      if (r.professoresPendentes.length > 0) {
        log(
          `\n⚠  ${r.professoresPendentes.length} professores entraram SEM e-mail e estão INATIVOS.\n` +
            '   O JACAD devolve apenas o nome do docente, não um cadastro.\n' +
            '   Eles não conseguem logar nem receber avaliação até que a secretaria\n' +
            '   informe o e-mail institucional de cada um:\n',
        );
        for (const p of r.professoresPendentes.slice(0, 15)) log(`     · ${p}`);
        if (r.professoresPendentes.length > 15) {
          log(`     … e mais ${r.professoresPendentes.length - 15}`);
        }
      }
      return;
    }

    default:
      log(`Comandos:
  testar                              testa a autenticação no JACAD
  verificar                           lê a API e mostra amostras (não grava)
  sondar-docentes --periodo=<id>      investiga se há id estável de professor
  sondar-login                        procura endpoint de login de aluno
  testar-sso --ra=<ra> [--cpa=url]    testa o SSO do portal ponta a ponta
  periodos                            lista os períodos já em staging
  sync periodos                       importa os períodos letivos
  sync cursos                         importa os cursos
  sync turmas [--ano=2026]            importa as turmas
  sync matriculas --periodo=<id>      importa alunos e matrículas
  sync disciplinas --periodo=<id>     importa disciplinas + professor (lento)
  sync tudo --periodo=<id>            tudo acima, na ordem
  conciliar-docentes [--periodo=<id>] casa professores com /basicos/perfis
  promover --periodo=<id>             staging -> entidades do CPA`);
      process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    if (e instanceof JacadError) {
      console.error(`\n❌ JACAD (HTTP ${e.status}): ${e.message}`);
      if (e.body) console.error(`   ${e.body.slice(0, 300)}`);
    } else {
      console.error(`\n❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
