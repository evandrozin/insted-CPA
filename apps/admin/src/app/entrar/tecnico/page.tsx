/**
 * Entrada do corpo técnico-administrativo — só o e-mail.
 *
 * Tela própria, no mesmo desenho da entrada dos demais respondentes. É o link
 * que a CPA envia aos funcionários. Ver `actions.ts` para o que esta entrada
 * garante e o que não garante.
 */
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { respondenteAtual } from '@/lib/sessao';
import { entrarTecnico } from './actions';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2.5 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-xs font-semibold text-slate-500';

export default async function EntrarTecnico({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (await respondenteAtual()) redirect('/minhas-avaliacoes');
  const sp = await searchParams;
  const erro = typeof sp.erro === 'string' ? sp.erro.slice(0, 300) : null;

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
              Corpo técnico-administrativo. Informe o seu e-mail para responder.
            </p>

            {erro && (
              <p
                role="alert"
                className="mt-4 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600"
              >
                {erro}
              </p>
            )}

            <form method="post" className="mt-6 flex flex-col gap-3">
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
                formAction={entrarTecnico}
                className="mt-2 rounded-xl bg-brand-teal px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-teal-hover"
              >
                Continuar
              </button>
            </form>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Cada funcionário responde uma vez. Suas respostas são anônimas: nem a CPA nem a
          coordenação conseguem ligar uma resposta a você.
        </p>
      </div>
    </div>
  );
}
