/**
 * Entrada do respondente.
 *
 * Tela própria, sem a barra lateral do painel: quem entra aqui é aluno ou
 * professor respondendo, não a CPA administrando.
 */
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { respondenteAtual } from '@/lib/sessao';
import { entrar, criarSenha } from './actions';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-xs font-semibold text-slate-500';

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await respondenteAtual()) redirect('/minhas-avaliacoes');
  const sp = await searchParams;
  const erro = typeof sp.erro === 'string' ? sp.erro : null;

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
              Avaliação Institucional
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Entre com sua matrícula para responder.
            </p>

            {erro && (
              <p className="mt-4 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600">
                {erro}
              </p>
            )}

            <form method="post" className="mt-6 flex flex-col gap-3">
              <label className={rotulo}>
                Matrícula ou RA
                <input name="matricula" autoComplete="username" required className={`${campo} mt-1`} />
              </label>
              <label className={rotulo}>
                Senha
                <input
                  type="password"
                  name="senha"
                  autoComplete="current-password"
                  required
                  className={`${campo} mt-1`}
                />
              </label>
              <button
                formAction={entrar}
                className="mt-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
              >
                Entrar
              </button>
            </form>
          </div>

          <details className="border-t border-slate-100 px-6 py-4">
            <summary className="cursor-pointer text-xs font-semibold text-brand-teal hover:text-brand-teal-hover">
              Primeiro acesso — criar minha senha
            </summary>

            <form method="post" className="mt-4 flex flex-col gap-3">
              <p className="text-xs text-slate-500">
                Confirmamos seu e-mail cadastrado antes de criar a senha.
              </p>
              <label className={rotulo}>
                Matrícula ou RA
                <input name="matricula" required className={`${campo} mt-1`} />
              </label>
              <label className={rotulo}>
                E-mail do seu cadastro
                <input type="email" name="email" required className={`${campo} mt-1`} />
              </label>
              <label className={rotulo}>
                Nova senha
                <input
                  type="password"
                  name="senha"
                  minLength={8}
                  autoComplete="new-password"
                  required
                  className={`${campo} mt-1`}
                />
              </label>
              <label className={rotulo}>
                Repita a senha
                <input
                  type="password"
                  name="confirmacao"
                  minLength={8}
                  autoComplete="new-password"
                  required
                  className={`${campo} mt-1`}
                />
              </label>
              <button
                formAction={criarSenha}
                className="mt-1 rounded-xl border border-brand-navy/10 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
              >
                Criar senha e entrar
              </button>
            </form>
          </details>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Suas respostas são anônimas. Nem a CPA nem a coordenação conseguem ligar uma resposta a
          você.
        </p>
      </div>
    </div>
  );
}
