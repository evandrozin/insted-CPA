'use client';

/**
 * Formulário da entrada do técnico: o e-mail e, só quando o e-mail é de mais de
 * um técnico (caixa de setor), a pergunta "quem é você?".
 */
import { useActionState } from 'react';
import { entrarTecnico, type EstadoEntrada } from '@/app/entrar/tecnico/actions';

const campo =
  'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-xs font-semibold text-slate-500';

export function EntradaTecnico() {
  const [estado, executar, pendente] = useActionState(entrarTecnico, { n: 0 } as EstadoEntrada);

  if (estado.opcoes && estado.email) {
    return (
      <form action={executar} className="mt-6 flex flex-col gap-3">
        <input type="hidden" name="email" value={estado.email} />
        <p className="text-sm text-slate-600">
          Mais de uma pessoa usa o e-mail <strong className="text-brand-navy">{estado.email}</strong>.
          Quem é você?
        </p>
        {estado.opcoes.map((o) => (
          <button
            key={o.id}
            name="escolhido"
            value={o.id}
            disabled={pendente}
            className="rounded-xl border border-brand-navy/15 bg-white px-4 py-3 text-left text-sm font-semibold text-brand-navy transition-colors hover:border-brand-teal hover:bg-brand-teal/5 disabled:opacity-60"
          >
            {o.nome}
          </button>
        ))}
        <a href="/entrar/tecnico" className="mt-1 text-xs font-semibold text-slate-500 hover:text-brand-teal">
          ← Usar outro e-mail
        </a>
      </form>
    );
  }

  return (
    <form action={executar} className="mt-6 flex flex-col gap-3">
      <label className={rotulo}>
        Seu e-mail
        <input
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="nome@insted.edu.br"
          required
          className={`${campo} mt-1`}
        />
      </label>
      <button
        disabled={pendente}
        className="mt-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover disabled:opacity-60"
      >
        {pendente ? 'Entrando…' : 'Continuar'}
      </button>
    </form>
  );
}
