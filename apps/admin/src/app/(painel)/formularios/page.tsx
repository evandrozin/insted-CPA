/**
 * Lista dos formulários carregados. Leitura direta do banco enquanto a API
 * não existe — ver a nota em integracoes/jacad/page.tsx.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';

export const dynamic = 'force-dynamic';

const PUBLICO: Record<string, string> = {
  ALUNO: 'Discentes',
  PROFESSOR: 'Docentes',
  TECNICO_ADMIN: 'Técnico-administrativo',
};

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  RASCUNHO: { rotulo: 'rascunho', classe: 'bg-brand-orange/10 text-brand-orange' },
  PUBLICADO: { rotulo: 'publicado', classe: 'bg-brand-teal/10 text-brand-teal-hover' },
  ARQUIVADO: { rotulo: 'arquivado', classe: 'bg-slate-100 text-slate-400' },
};

export default async function Formularios() {
  let forms: Awaited<ReturnType<typeof carregar>> = [];
  let erro: string | null = null;

  try {
    forms = await carregar();
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Instrumentos
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Formulários
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          Os três instrumentos aplicados em 2025, transcritos do Drive da CPA na redação original.
          Entram como rascunho: revise, ajuste e publique — publicar congela a versão para o ciclo.
        </p>
      </header>

      {erro && (
        <p className="mt-6 rounded-lg border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600">
          Banco indisponível. Suba a infraestrutura com{' '}
          <code className="font-mono text-xs text-brand-navy">npm run infra:up</code>.
        </p>
      )}

      {forms.length === 0 && !erro && (
        <p className="mt-6 rounded-lg border border-brand-navy/10 bg-white px-4 py-3 text-sm text-slate-500">
          Nenhum formulário carregado. Rode{' '}
          <code className="font-mono text-xs text-brand-navy">npm run db:formularios</code>.
        </p>
      )}

      <ul className="mt-8 flex flex-col gap-4">
        {forms.map((f) => {
          const st = STATUS[f.status] ?? STATUS.RASCUNHO;
          const questoes = f.blocos.reduce((s, b) => s + b._count.questoes, 0);
          const avisos = f.blocos.filter((b) =>
            /DUPLICADO|RISCO|ATENÇÃO|inconsistente/i.test(b.descricao ?? ''),
          ).length;

          return (
            <li key={f.id}>
              <Link
                href={`/formularios/${f.id}`}
                className="block rounded-2xl border border-brand-navy/10 bg-white px-5 py-4 transition-colors hover:border-brand-teal/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        {PUBLICO[f.publico] ?? f.publico}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${st.classe}`}
                      >
                        {st.rotulo}
                      </span>
                      <span className="text-[10px] text-slate-400">v{f.versao}</span>
                    </div>
                    <p className="mt-1.5 font-brand text-base font-semibold text-brand-navy">
                      {f.nome}
                    </p>
                    {f.descricao && (
                      <p className="mt-1 text-sm text-slate-500">{f.descricao}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-6 text-right">
                    <div>
                      <p className="text-lg font-semibold text-brand-navy tabular-nums">
                        {f.blocos.length}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                        blocos
                      </p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-brand-navy tabular-nums">
                        {questoes}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.08em] text-slate-400">
                        questões
                      </p>
                    </div>
                  </div>
                </div>

                {avisos > 0 && (
                  <p className="mt-3 border-t border-slate-100 pt-3 text-xs font-semibold text-brand-orange">
                    {avisos} {avisos === 1 ? 'bloco marcado' : 'blocos marcados'} para revisão
                  </p>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

async function carregar() {
  return prisma.formTemplate.findMany({
    orderBy: { publico: 'asc' },
    include: {
      blocos: {
        orderBy: { ordem: 'asc' },
        select: { id: true, descricao: true, _count: { select: { questoes: true } } },
      },
    },
  });
}
