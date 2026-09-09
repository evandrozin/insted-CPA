/**
 * Teste ponta a ponta do SSO pelo portal do JACAD.
 *
 *   npm run jacad -- testar-sso --ra=2023104129
 *   npm run jacad -- testar-sso --ra=… --cpa=https://cpa.insted.edu.br
 *
 * Faz o papel do portal (emite um accessToken via `login/aluno`) e depois o
 * papel do navegador do aluno (chega ao CPA com esse token). Exige o CPA no
 * ar — é teste de integração, não de unidade.
 *
 * Não grava nada no banco além do que o próprio login gravaria: uma linha
 * `SSO_LOGIN` na auditoria e o `ultimoAcesso` do aluno. Rodar em produção
 * significa registrar um acesso que não aconteceu de verdade; prefira o
 * ambiente de homologação.
 *
 * Ver docs/08-autenticacao-jacad.md.
 */
import type { JacadClient } from './client.js';

type Passo = { nome: string; ok: boolean; detalhe: string };

export async function testarSso(
  cliente: JacadClient,
  ra: string,
  cpa = 'http://localhost:3000',
): Promise<void> {
  const passos: Passo[] = [];
  const marcar = (nome: string, ok: boolean, detalhe: string) => {
    passos.push({ nome, ok, detalhe });
    console.log(`  ${ok ? '✅' : '❌'} ${nome.padEnd(34)} ${detalhe}`);
  };

  console.log(`\nSSO do portal — RA ${ra} → ${cpa}\n`);

  // 1. Papel do portal: emitir o accessToken do aluno.
  const emissao = await cliente.postBruto(
    `/api/v1/auth/login/aluno?ra=${encodeURIComponent(ra)}&idOrg=0`,
    {},
  );
  const accessToken: string | undefined = emissao.json?.token;
  marcar(
    'portal emite accessToken',
    Boolean(accessToken),
    accessToken ? `${accessToken.slice(0, 8)}…` : `HTTP ${emissao.status} ${emissao.corpo}`,
  );
  if (!accessToken) return concluir(passos);

  // 2. O aluno chega ao CPA com o token na URL.
  const alvo = `${cpa.replace(/\/+$/, '')}/entrar/jacad?accessToken=${encodeURIComponent(accessToken)}`;
  const entrada = await fetch(alvo, { redirect: 'manual' }).catch((e: Error) => e);
  if (entrada instanceof Error) {
    marcar('CPA responde', false, `o CPA está no ar em ${cpa}? (${entrada.message})`);
    return concluir(passos);
  }

  const destino = decodeURIComponent(entrada.headers.get('location') ?? '');
  const setCookie = entrada.headers.get('set-cookie') ?? '';
  const temSessao = setCookie.includes('insted_sessao');

  marcar(
    'CPA abre sessão',
    temSessao && destino.endsWith('/minhas-avaliacoes'),
    temSessao ? `${entrada.status} → ${destino}` : destino || `HTTP ${entrada.status}`,
  );
  if (!temSessao) return concluir(passos);

  // 3. A sessão realmente dá acesso à área do respondente.
  const cookie = setCookie.split(';')[0];
  const pagina = await fetch(`${cpa}/minhas-avaliacoes`, { headers: { Cookie: cookie } });
  const html = await pagina.text();
  const avaliacoes = (html.match(/href="\/responder\//g) ?? []).length;
  marcar(
    'área do aluno responde',
    pagina.status === 200,
    `HTTP ${pagina.status} · ${avaliacoes} avaliação(ões) listada(s)`,
  );

  // 4. O token não pode servir duas vezes — é o que limita o vazamento pela
  //    query string (histórico, log de proxy, Referer).
  const repetido = await fetch(alvo, { redirect: 'manual' });
  const recusou = !(repetido.headers.get('set-cookie') ?? '').includes('insted_sessao');
  marcar('token é de uso único', recusou, recusou ? 'reuso recusado' : 'REUSO ACEITO — investigar');

  concluir(passos);
}

function concluir(passos: Passo[]): void {
  const falhas = passos.filter((p) => !p.ok).length;
  console.log(
    falhas === 0
      ? '\nFluxo completo. O portal só precisa apresentar o link.\n'
      : `\n${falhas} passo(s) falharam.\n`,
  );
  if (falhas > 0) process.exitCode = 1;
}
