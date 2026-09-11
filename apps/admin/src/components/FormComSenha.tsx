'use client';

/**
 * Formulário cuja ação devolve uma senha provisória — e a janela que a mostra.
 *
 * A senha chega na resposta da ação e vive só no estado deste componente: não
 * passa por URL, cookie, banco ou memória do servidor. Recarregar a página a
 * faz sumir, que é o comportamento certo para um segredo de uso único.
 *
 * A janela não fecha com clique fora nem com Esc: quem fecha é o botão "Já
 * anotei". Fechar por engano uma senha que não será mostrada de novo obriga a
 * gerar outra — e cada geração invalida a anterior.
 */
import { useActionState, useEffect, useState } from 'react';
import type { EstadoSenha } from '@/lib/estado-senha';
import { ESTADO_SENHA_INICIAL } from '@/lib/estado-senha';

type Acao = (anterior: EstadoSenha, dados: FormData) => Promise<EstadoSenha>;

export function FormComSenha({
  acao,
  className,
  children,
}: {
  acao: Acao;
  className?: string;
  children: React.ReactNode;
}) {
  const [estado, executar] = useActionState(acao, ESTADO_SENHA_INICIAL);
  const [aberta, setAberta] = useState(false);
  const [copiada, setCopiada] = useState(false);

  useEffect(() => {
    if (estado.n === 0) return;
    // A ação terminou: derruba o aviso de "processando", que não tem como
    // saber disso sozinho quando a resposta não muda de rota.
    window.dispatchEvent(new Event('cpa:acao-terminou'));
    setCopiada(false);
    setAberta(Boolean(estado.senha || estado.erro));
  }, [estado.n, estado.senha, estado.erro]);

  const copiar = async () => {
    if (!estado.senha) return;
    try {
      await navigator.clipboard.writeText(estado.senha);
      setCopiada(true);
    } catch {
      setCopiada(false);
    }
  };

  return (
    <>
      <form action={executar} className={className}>
        {children}
      </form>

      {aberta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-senha"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-brand-navy/40 px-6 backdrop-blur-[2px]"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-brand-navy/10 bg-white shadow-xl">
            {estado.erro ? (
              <div className="px-6 py-6">
                <p id="titulo-senha" className="font-brand text-base font-bold text-brand-orange">
                  Não foi possível concluir
                </p>
                <p className="mt-2 text-sm text-slate-600">{estado.erro}</p>
                <button
                  type="button"
                  onClick={() => setAberta(false)}
                  className="mt-5 rounded-lg border border-brand-navy/15 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-brand-teal/40 hover:text-brand-teal-hover"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <>
                <div className="border-b border-brand-teal/20 bg-brand-teal/5 px-6 py-4">
                  <p id="titulo-senha" className="font-brand text-base font-bold text-brand-teal-hover">
                    Senha provisória de {estado.nome}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-slate-500">{estado.email}</p>
                </div>

                <div className="px-6 py-6">
                  <p className="select-all rounded-xl bg-brand-light px-4 py-3 text-center font-mono text-2xl font-semibold tracking-wide text-brand-navy">
                    {estado.senha}
                  </p>

                  {estado.aviso && <p className="mt-3 text-xs text-slate-500">{estado.aviso}</p>}

                  <p className="mt-3 text-xs text-slate-500">
                    Anote agora: ela não será mostrada de novo, e o banco guarda só o hash. Entregue
                    por um canal diferente do e-mail da conta. No primeiro acesso a pessoa define a
                    própria senha.
                  </p>

                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={copiar}
                      className="rounded-lg border border-brand-navy/15 px-4 py-2 text-xs font-semibold text-slate-600 hover:border-brand-teal/40 hover:text-brand-teal-hover"
                    >
                      {copiada ? 'Copiada' : 'Copiar senha'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setAberta(false)}
                      className="rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white hover:bg-brand-teal-hover"
                    >
                      Já anotei
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
