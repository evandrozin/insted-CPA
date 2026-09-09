/**
 * Área de importação de dados do JACAD.
 *
 * Somente leitura por enquanto: a execução acontece pelo CLI
 * (`npm run jacad -- …`), como no Insted Hub Digital, que também roda a
 * ingestão por comando de console. Quando a API NestJS entrar (Fase 1), esta
 * tela ganha os botões e passa a disparar os jobs.
 *
 * A página lê o banco direto porque ainda não existe API. Se o Postgres não
 * estiver de pé, ela mostra o estado vazio em vez de estourar.
 */
import { prisma } from '@insted/database';

export const dynamic = 'force-dynamic';

type EstadoRecurso = {
  chave: string;
  titulo: string;
  descricao: string;
  comando: string;
  registros: number | null;
  ultimaSync: { status: string; total: number; em: Date | null } | null;
};

const RECURSOS = [
  {
    chave: 'PERIODOS_LETIVOS',
    titulo: 'Períodos letivos',
    descricao: 'Semestres do JACAD. Pré-requisito de turmas e matrículas.',
    comando: 'npm run jacad -- sync periodos',
  },
  {
    chave: 'CURSOS',
    titulo: 'Cursos',
    descricao: 'Cursos base da instituição.',
    comando: 'npm run jacad -- sync cursos',
  },
  {
    chave: 'TURMAS',
    titulo: 'Turmas',
    descricao: 'Turmas por período e status. Traz turno e semestre em curso.',
    comando: 'npm run jacad -- sync turmas --ano=2026',
  },
  {
    chave: 'MATRICULAS',
    titulo: 'Alunos e matrículas',
    descricao: 'Um registro por aluno matriculado: RA, nome, e-mail e turma.',
    comando: 'npm run jacad -- sync matriculas --periodo=<id>',
  },
  {
    chave: 'MATRICULA_DISCIPLINA',
    titulo: 'Disciplinas e professores',
    descricao: 'Disciplinas cursadas por aluno. Única fonte de professor. Lento.',
    comando: 'npm run jacad -- sync disciplinas --periodo=<id>',
  },
] as const;

async function carregar(): Promise<{ recursos: EstadoRecurso[]; cpa: Record<string, number> | null; erro: string | null }> {
  try {
    const [periodos, cursos, turmas, matriculas, disciplinas, logs] = await Promise.all([
      prisma.jacadPeriodoLetivo.count(),
      prisma.jacadCurso.count(),
      prisma.jacadTurma.count(),
      prisma.jacadMatricula.count(),
      prisma.jacadMatriculaDisciplina.count(),
      prisma.jacadSyncLog.findMany({ orderBy: { iniciadoEm: 'desc' }, take: 50 }),
    ]);

    const contagem: Record<string, number> = {
      PERIODOS_LETIVOS: periodos,
      CURSOS: cursos,
      TURMAS: turmas,
      MATRICULAS: matriculas,
      MATRICULA_DISCIPLINA: disciplinas,
    };

    const recursos = RECURSOS.map((r) => {
      const log = logs.find((l) => l.recurso === r.chave);
      return {
        ...r,
        registros: contagem[r.chave] ?? 0,
        ultimaSync: log
          ? { status: log.status, total: log.totalRegistros, em: log.concluidoEm ?? log.iniciadoEm }
          : null,
      };
    });

    const [alunosCpa, professoresCpa, turmasCpa, alocacoesCpa] = await Promise.all([
      prisma.user.count({ where: { role: 'ALUNO' } }),
      prisma.user.count({ where: { role: 'PROFESSOR' } }),
      prisma.schoolClass.count(),
      prisma.teachingAssignment.count(),
    ]);

    return {
      recursos,
      cpa: {
        Alunos: alunosCpa,
        Professores: professoresCpa,
        Turmas: turmasCpa,
        'Alocações docentes': alocacoesCpa,
      },
      erro: null,
    };
  } catch (e) {
    return {
      recursos: RECURSOS.map((r) => ({ ...r, registros: null, ultimaSync: null })),
      cpa: null,
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}

const fmt = (n: number | null) => (n === null ? '—' : n.toLocaleString('pt-BR'));

const dataHora = (d: Date | null) =>
  d
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d)
    : '—';

export default async function IntegracaoJacad() {
  const { recursos, cpa, erro } = await carregar();
  const tokenConfigurado = Boolean(process.env.JACAD_TOKEN);
  const baseUrl = process.env.JACAD_BASE_URL ?? 'https://insted-developer.jacad.com.br';

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Integrações
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Importação do JACAD
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Os dados acadêmicos vêm da mesma API que o Insted Hub Digital já consome. A importação tem
          dois passos: primeiro o <strong className="font-semibold text-brand-navy">staging</strong>{' '}
          guarda o retorno cru da API; depois a{' '}
          <strong className="font-semibold text-brand-navy">promoção</strong> transforma isso nas
          entidades da avaliação.
        </p>
      </header>

      {/* ---------------------------------------------------------- conexão */}
      <section className="mt-8 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Endpoint
            </p>
            <p className="mt-0.5 font-mono text-xs text-brand-navy">{baseUrl}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              Token de API
            </p>
            <p className="mt-0.5 text-sm font-semibold">
              {tokenConfigurado ? (
                <span className="text-brand-teal-hover">configurado</span>
              ) : (
                <span className="text-brand-orange">ausente — defina JACAD_TOKEN</span>
              )}
            </p>
          </div>
          <div className="ml-auto">
            <code className="rounded-lg bg-brand-light px-2.5 py-1.5 font-mono text-xs text-brand-navy">
              npm run jacad -- testar
            </code>
          </div>
        </div>
      </section>

      {erro && (
        <p className="mt-3 rounded-lg border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600">
          Banco indisponível, então os números abaixo não carregaram. Suba a infraestrutura com{' '}
          <code className="font-mono text-xs text-brand-navy">npm run infra:up</code> e rode as
          migrações.
        </p>
      )}

      {/* ------------------------------------------------------ 1. staging */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">
            1
          </span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
            Staging — trazer da API
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Rode na ordem: turmas dependem dos períodos, e disciplinas dependem das matrículas.
        </p>

        <ol className="mt-4 flex flex-col gap-3">
          {recursos.map((r, i) => (
            <li
              key={r.chave}
              className="rounded-2xl border border-brand-navy/10 bg-white px-5 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-brand-navy">
                    <span className="mr-2 font-mono text-xs text-slate-400">{i + 1}.</span>
                    {r.titulo}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">{r.descricao}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-brand-navy tabular-nums">
                    {fmt(r.registros)}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                    em staging
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <code className="rounded-lg bg-brand-light px-2.5 py-1.5 font-mono text-[11px] text-brand-navy">
                  {r.comando}
                </code>
                <span className="text-xs text-slate-400">
                  {r.ultimaSync
                    ? `última: ${dataHora(r.ultimaSync.em)} · ${r.ultimaSync.status.toLowerCase()}`
                    : 'nunca sincronizado'}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ----------------------------------------------------- 2. promoção */}
      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">
            2
          </span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
            Conciliar docentes — dar acesso aos professores
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Casa o nome de cada professor com o cadastro de pessoas do JACAD, recuperando e-mail e
          CPF. Sem este passo o docente entra sem login.
        </p>
        <div className="mt-4 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
          <code className="rounded-lg bg-brand-light px-2.5 py-1.5 font-mono text-[11px] text-brand-navy">
            npm run jacad -- conciliar-docentes --periodo=&lt;id&gt;
          </code>
        </div>
      </section>

      <section className="mt-10">
        <div className="flex items-baseline gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-[11px] font-bold text-white">
            3
          </span>
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
            Promoção — virar dado da avaliação
          </h2>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Transforma o staging em cursos, turmas, disciplinas, alunos, professores e alocações. É a
          alocação docente que decide quem cada aluno vai avaliar.
        </p>

        <div className="mt-4 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4">
          <code className="rounded-lg bg-brand-light px-2.5 py-1.5 font-mono text-[11px] text-brand-navy">
            npm run jacad -- promover --periodo=&lt;id&gt;
          </code>

          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-100 sm:grid-cols-4">
            {Object.entries(
              cpa ?? { Alunos: 0, Professores: 0, Turmas: 0, 'Alocações docentes': 0 },
            ).map(([rotulo, valor]) => (
              <div key={rotulo} className="bg-white px-4 py-3">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  {rotulo}
                </dt>
                <dd className="mt-1 text-xl font-semibold text-brand-navy tabular-nums">
                  {cpa ? valor.toLocaleString('pt-BR') : '—'}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------- o problema */}
      <section className="mt-8 rounded-2xl border border-brand-orange/30 bg-brand-orange/5 px-5 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-orange">
          Atenção — conciliação de docentes
        </p>
        <p className="mt-2 text-sm text-slate-600">
          O JACAD devolve o professor apenas como <strong>nome em texto</strong>, sem e-mail. Sem
          e-mail o docente não entra no sistema — não vê o próprio relatório nem responde à
          autoavaliação. O passo de conciliação casa cada nome com{' '}
          <code className="font-mono text-xs">/basicos/perfis</code> e recupera o cadastro real.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Na medição feita no período 2026.2, <strong>72% dos docentes casaram</strong> com um único
          perfil (todos com e-mail) e <strong>nenhum ficou sem cadastro</strong>. Os 28% restantes
          são nomes com dois ou três perfis, todos com CPFs diferentes e ativos — homônimos reais,
          que o importador <strong>não decide sozinho</strong>: mandar a avaliação de um professor
          para outra pessoa é o pior defeito possível aqui.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Os ambíguos ficam registrados para decisão manual e entram INATIVOS até serem resolvidos.
          A saída definitiva é uma planilha da secretaria com nome, CPF e e-mail institucional —
          conciliar por CPF zera a ambiguidade.
        </p>
      </section>
    </div>
  );
}
