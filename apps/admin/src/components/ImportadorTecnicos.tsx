'use client';

/**
 * Tela de importação de técnicos: envia o arquivo, mostra a prévia linha a
 * linha e só então grava. Os dois passos usam a mesma ação; o que muda é o
 * campo `etapa`.
 */
import { useActionState, useEffect } from 'react';
import Link from 'next/link';
import {
  importarTecnicos,
  type EstadoImportacao,
} from '@/app/(painel)/cadastros/tecnicos/importar/actions';
import type { SituacaoLinha } from '@/lib/importar-tecnicos';

const ROTULO: Record<SituacaoLinha, { texto: string; classe: string }> = {
  novo: { texto: 'novo', classe: 'bg-brand-teal/10 text-brand-teal-hover' },
  ja: { texto: 'já cadastrado', classe: 'bg-slate-100 text-slate-500' },
  inativo: { texto: 'inativo', classe: 'bg-brand-orange/10 text-brand-orange' },
  conflito: { texto: 'conflito', classe: 'bg-brand-orange/10 text-brand-orange' },
  erro: { texto: 'erro', classe: 'bg-red-50 text-red-600' },
};

export function ImportadorTecnicos() {
  const [estado, executar, pendente] = useActionState(importarTecnicos, { n: 0 } as EstadoImportacao);

  useEffect(() => {
    if (estado.n > 0) window.dispatchEvent(new Event('cpa:acao-terminou'));
  }, [estado.n]);

  const linhas = estado.linhas ?? [];
  const conta = (s: SituacaoLinha) => linhas.filter((l) => l.situacao === s).length;
  const novos = conta('novo');
  const inativos = conta('inativo');
  const reativar = Boolean(estado.reativar);
  const aGravar = novos + (reativar ? inativos : 0);

  if (estado.concluido) {
    const c = estado.concluido;
    return (
      <div className="mt-8 rounded-2xl border border-brand-teal/30 bg-brand-teal/5 px-5 py-5">
        <p className="font-brand text-lg font-bold text-brand-navy">Importação concluída</p>
        <p className="mt-2 text-sm text-slate-600">
          {c.criados} cadastrado{c.criados === 1 ? '' : 's'}
          {c.reativados > 0 && <>, {c.reativados} reativado{c.reativados === 1 ? '' : 's'}</>}
          {c.semMudanca > 0 && <> · {c.semMudanca} sem mudança (já existiam, em conflito ou com erro)</>}
          .
        </p>
        <p className="mt-3 rounded-xl bg-white px-4 py-3 text-sm text-slate-600">
          Não há senha a entregar: os técnicos entram só com o e-mail, pelo link{' '}
          <code className="font-mono text-xs text-brand-navy">/entrar/tecnico</code>.
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/cadastros/tecnicos" className="font-semibold text-brand-teal hover:text-brand-teal-hover">
            Ver a lista →
          </Link>
          <Link
            href="/cadastros/tecnicos/importar"
            className="font-semibold text-slate-500 hover:text-brand-teal"
          >
            Importar outra planilha
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {estado.erro && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600"
        >
          {estado.erro}
        </p>
      )}

      <form action={executar} className="rounded-2xl border border-brand-navy/10 bg-white px-5 py-5">
        <input type="hidden" name="etapa" value="analisar" />
        <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
          Planilha (.xlsx ou .csv)
          <input
            type="file"
            name="arquivo"
            accept=".xlsx,.csv,.txt"
            required
            className="mt-2 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-light file:px-3 file:py-2 file:text-xs file:font-semibold file:text-brand-navy"
          />
        </label>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-600">
          <input type="checkbox" name="reativar" defaultChecked={reativar} className="mt-0.5 accent-brand-teal" />
          <span>
            Reativar técnicos que estão <strong>inativos</strong> e aparecem na planilha.
            <span className="block text-xs text-slate-400">
              Desmarcado, eles ficam como estão — quem foi desativado de propósito não volta sozinho.
            </span>
          </span>
        </label>
        <button
          disabled={pendente}
          className="mt-4 rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover disabled:opacity-60"
        >
          {pendente ? 'Lendo…' : 'Ler planilha e mostrar prévia'}
        </button>
      </form>

      {linhas.length > 0 && (
        <section className="mt-8">
          <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
            Prévia — {estado.arquivo}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {linhas.length} linhas: <strong>{novos}</strong> novas
            {conta('ja') > 0 && <>, {conta('ja')} já cadastrada{conta('ja') === 1 ? '' : 's'}</>}
            {inativos > 0 && <>, {inativos} inativa{inativos === 1 ? '' : 's'}</>}
            {conta('conflito') > 0 && <>, {conta('conflito')} em conflito</>}
            {conta('erro') > 0 && <>, {conta('erro')} com erro</>}. Nada foi gravado ainda.
          </p>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                <tr>
                  <th className="px-4 py-2">Linha</th>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">E-mail</th>
                  <th className="px-4 py-2">Matrícula</th>
                  <th className="px-4 py-2">Situação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const r = ROTULO[l.situacao];
                  return (
                    <tr key={l.linha} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">{l.linha}</td>
                      <td className="px-4 py-2 text-brand-navy">{l.nome || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-500">{l.email || '—'}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">{l.matricula || '—'}</td>
                      <td className="px-4 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${r.classe}`}
                        >
                          {r.texto}
                        </span>
                        {l.motivo && l.situacao !== 'ja' && l.situacao !== 'novo' && (
                          <span className="ml-2 text-xs text-slate-500">{l.motivo}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {aGravar > 0 ? (
            <form action={executar} className="mt-5 flex flex-wrap items-center gap-3">
              <input type="hidden" name="etapa" value="confirmar" />
              <input type="hidden" name="linhas" value={JSON.stringify(linhas)} />
              {reativar && <input type="hidden" name="reativar" value="on" />}
              <button
                disabled={pendente}
                className="rounded-lg bg-brand-teal px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover disabled:opacity-60"
              >
                {pendente
                  ? 'Gravando…'
                  : `Cadastrar ${novos} novo${novos === 1 ? '' : 's'}${
                      reativar && inativos ? ` e reativar ${inativos}` : ''
                    }`}
              </button>
              <p className="text-xs text-slate-400">
                Linhas com erro ou conflito não são gravadas. Corrija a planilha e envie de novo, se
                quiser incluí-las.
              </p>
            </form>
          ) : (
            <p className="mt-5 rounded-xl bg-brand-light px-4 py-3 text-sm text-slate-600">
              Nada a cadastrar nesta planilha. Corrija o que está marcado e envie de novo.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
