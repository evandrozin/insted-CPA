/**
 * Área de importação de dados do JACAD.
 *
 * Cada passo tem botão, exceto disciplinas — que são milhares de chamadas em
 * sequência e não cabem no tempo de uma requisição. Esse continua no CLI até
 * existir fila.
 *
 * Os botões rodam no processo do servidor, então dependem de duas condições
 * do ambiente onde o painel está hospedado: `JACAD_TOKEN` definido e IP de
 * saída liberado na API. A segunda costuma faltar em serverless, onde o IP
 * muda a cada execução — o erro traduzido em `actions.ts` diz isso em vez de
 * repetir "falha na chamada".
 *
 * A página lê o banco direto porque ainda não existe API. Se o Postgres não
 * estiver de pé, ela mostra o estado vazio em vez de estourar.
 */
import { prisma } from '@insted/database';
import {
  conciliarDocentes,
  promover,
  sincronizarCursos,
  sincronizarMatriculas,
  sincronizarPeriodos,
  sincronizarTurmas,
  testarConexao,
} from './actions';

export const dynamic = 'force-dynamic';

const botao =
  'rounded-lg bg-brand-teal px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-teal-hover disabled:opacity-40';
const botaoSecundario =
  'rounded-lg border border-brand-navy/15 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover';
const seletor =
  'rounded-lg border border-brand-navy/15 bg-white px-2 py-1.5 text-[11px] text-brand-navy outline-none focus:border-brand-teal';

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

  // Períodos já em staging alimentam os seletores. Antes do primeiro sync a
  // lista é vazia, e os botões que dependem dela ficam desabilitados — é a
  // ordem correta de execução virando restrição de tela.
  const periodos = await prisma.jacadPeriodoLetivo
    .findMany({ orderBy: [{ ano: 'desc' }, { semestre: 'desc' }], take: 30 })
    .catch(() => []);
  const anoAtual = new Date().getFullYear();
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
          <form className="ml-auto">
            <button formAction={testarConexao} className={botaoSecundario} disabled={!tokenConfigurado}>
              Testar conexão
            </button>
          </form>
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
                <div className="flex flex-wrap items-center gap-2">
                  {r.chave === 'PERIODOS_LETIVOS' && (
                    <form>
                      <button formAction={sincronizarPeriodos} className={botao} disabled={!tokenConfigurado}>
                        Importar
                      </button>
                    </form>
                  )}

                  {r.chave === 'CURSOS' && (
                    <form>
                      <button formAction={sincronizarCursos} className={botao} disabled={!tokenConfigurado}>
                        Importar
                      </button>
                    </form>
                  )}

                  {r.chave === 'TURMAS' && (
                    <form className="flex items-center gap-2">
                      <input
                        name="ano"
                        type="number"
                        defaultValue={anoAtual}
                        className={`${seletor} w-20`}
                        aria-label="Ano das turmas"
                      />
                      <button formAction={sincronizarTurmas} className={botao} disabled={!tokenConfigurado}>
                        Importar
                      </button>
                    </form>
                  )}

                  {r.chave === 'MATRICULAS' && (
                    <form className="flex items-center gap-2">
                      <select name="periodo" className={seletor} aria-label="Período letivo">
                        {periodos.map((p) => (
                          <option key={p.idPeriodoLetivo} value={p.idPeriodoLetivo}>
                            {p.ano}.{p.semestre} — {p.descricao ?? p.idPeriodoLetivo}
                          </option>
                        ))}
                      </select>
                      <button
                        formAction={sincronizarMatriculas}
                        className={botao}
                        disabled={!tokenConfigurado || periodos.length === 0}
                      >
                        Importar
                      </button>
                    </form>
                  )}

                  {/* Disciplinas continua só no CLI: são milhares de chamadas
                      em sequência, horas de execução. Não cabe numa
                      requisição, e prometer um botão que estoura o tempo é
                      pior que não ter botão. */}
                  {r.chave === 'MATRICULA_DISCIPLINA' && (
                    <code className="rounded-lg bg-brand-light px-2.5 py-1.5 font-mono text-[11px] text-brand-navy">
                      {r.comando}
                    </code>
                  )}
                </div>

                <span className="text-xs text-slate-400">
                  {r.ultimaSync
                    ? `última: ${dataHora(r.ultimaSync.em)} · ${r.ultimaSync.status.toLowerCase()}`
                    : 'nunca sincronizado'}
                </span>
              </div>

              {r.chave === 'MATRICULA_DISCIPLINA' && (
                <p className="mt-2 text-xs text-brand-orange">
                  Sem botão de propósito: é uma chamada por matrícula, com pausa de rate limit —
                  horas de execução. Não cabe no tempo de uma requisição.
                </p>
              )}
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
          <form className="flex flex-wrap items-center gap-2">
            <select name="periodo" className={seletor} aria-label="Período letivo">
              <option value="">todos os períodos</option>
              {periodos.map((p) => (
                <option key={p.idPeriodoLetivo} value={p.idPeriodoLetivo}>
                  {p.ano}.{p.semestre} — {p.descricao ?? p.idPeriodoLetivo}
                </option>
              ))}
            </select>
            <button formAction={conciliarDocentes} className={botao} disabled={!tokenConfigurado}>
              Conciliar docentes
            </button>
          </form>
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
          <form className="flex flex-wrap items-center gap-2">
            <select name="periodo" className={seletor} aria-label="Período letivo a promover">
              {periodos.map((p) => (
                <option key={p.idPeriodoLetivo} value={p.idPeriodoLetivo}>
                  {p.ano}.{p.semestre} — {p.descricao ?? p.idPeriodoLetivo}
                </option>
              ))}
            </select>
            {/* Promoção não fala com a API: lê o staging. Por isso não depende
                do token nem do IP liberado. */}
            <button formAction={promover} className={botao} disabled={periodos.length === 0}>
              Promover
            </button>
          </form>

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
