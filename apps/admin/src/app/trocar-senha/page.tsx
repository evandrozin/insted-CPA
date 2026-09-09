/**
 * Troca de senha — obrigatória enquanto a senha for a provisória do CLI.
 *
 * Fora do grupo `(painel)` de propósito: `exigirPainel` manda para cá quem
 * ainda tem senha provisória, e se esta tela estivesse dentro do painel o
 * redirecionamento cairia sobre si mesmo.
 */
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { respondenteAtual } from '@/lib/sessao';
import { trocarSenha } from './actions';
import { MINIMO_SENHA } from './politica';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-xs font-semibold text-slate-500';

export default async function TrocarSenha() {
  const eu = await respondenteAtual();
  if (!eu) redirect('/entrar');

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-light px-6 py-12">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <Image
            src="/logo-insted.png"
            alt="Insted Centro Universitário"
            width={550}
            height={162}
            className="h-11 w-auto"
            priority
          />
        </div>

        <div className="relative mt-8 overflow-hidden rounded-2xl border border-brand-navy/10 bg-white">
          <div aria-hidden className="brand-rule absolute left-0 top-0 h-1 w-full" />

          <div className="px-6 py-6">
            <h1 className="font-brand text-xl font-bold tracking-tight text-brand-navy">
              {eu.senhaProvisoria ? 'Defina sua senha' : 'Trocar senha'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {eu.senhaProvisoria
                ? 'Sua senha atual foi gerada pela TI e serve só para esta primeira entrada.'
                : `Você está autenticado como ${eu.nome}.`}
            </p>

            <form className="mt-6 flex flex-col gap-3">
              <label className={rotulo}>
                Senha atual
                <input
                  type="password"
                  name="atual"
                  autoComplete="current-password"
                  required
                  className={`${campo} mt-1`}
                />
              </label>
              <label className={rotulo}>
                Nova senha
                <input
                  type="password"
                  name="nova"
                  minLength={MINIMO_SENHA}
                  autoComplete="new-password"
                  required
                  className={`${campo} mt-1`}
                />
              </label>
              <label className={rotulo}>
                Repita a nova senha
                <input
                  type="password"
                  name="confirmacao"
                  minLength={MINIMO_SENHA}
                  autoComplete="new-password"
                  required
                  className={`${campo} mt-1`}
                />
              </label>
              <button
                formAction={trocarSenha}
                className="mt-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
              >
                Salvar senha
              </button>
            </form>

            <p className="mt-4 text-xs text-slate-400">
              Mínimo de {MINIMO_SENHA} caracteres. Prefira uma frase que só você use — é mais fácil de
              lembrar e mais difícil de quebrar que uma palavra com símbolos no lugar de letras.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
