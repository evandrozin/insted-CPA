/**
 * Sondagem: /basicos/perfis serve para conciliar os professores?
 *
 * `matricula-disciplina` dá o NOME do docente. Se perfis puder ser consultado
 * por nome (ou varrido e indexado), obtemos idPerfil, e-mail e CPF — e o
 * professor passa a conseguir entrar no sistema.
 *
 * Descobre quais filtros o endpoint aceita. Não imprime CPF nem e-mail
 * completos: só diz se existem.
 */
import type { JacadClient } from './client.js';

const mascara = (v: unknown) => {
  if (typeof v !== 'string' || v === '') return '—';
  return `${v.slice(0, 2)}***${v.length > 6 ? v.slice(-2) : ''} (${v.length} car.)`;
};

export async function sondarPerfis(j: JacadClient, nomeAlvo: string) {
  console.log(`── filtros aceitos por /basicos/perfis ──────────────\n`);
  console.log(`  procurando por: "${nomeAlvo}"\n`);

  const tentativas: Array<[string, Record<string, unknown>]> = [
    ['nome', { nome: nomeAlvo }],
    ['perfilNome', { perfilNome: nomeAlvo }],
    ['nomeImpressao', { nomeImpressao: nomeAlvo }],
    ['search', { search: nomeAlvo }],
    ['filtro', { filtro: nomeAlvo }],
    ['cargo=PROFESSOR', { cargo: 'PROFESSOR' }],
    ['tipoPessoa=F', { tipoPessoa: 'F' }],
  ];

  for (const [rotulo, query] of tentativas) {
    try {
      const r = await j.get<any>('/api/v1/basicos/perfis', {
        ...query,
        pageSize: 5,
        currentPage: 0,
      });
      const els = r?.elements ?? [];
      const total = r?.page?.totalElements ?? '?';
      const casou = els.some((p: any) =>
        `${p.nome ?? ''}`.toUpperCase().includes(nomeAlvo.toUpperCase().split(' ')[0] ?? ''),
      );
      console.log(
        `  ${rotulo.padEnd(22)} → ${String(els.length).padStart(3)} de ${total}` +
          (casou ? '   ← filtrou de verdade' : ''),
      );
      if (casou && els[0]) {
        const p = els.find((x: any) =>
          `${x.nome ?? ''}`.toUpperCase().includes(nomeAlvo.toUpperCase().split(' ')[0] ?? ''),
        );
        console.log(`       idPerfil: ${p.idPerfil}`);
        console.log(`       nome:     ${p.nome}`);
        console.log(`       cargo:    ${p.cargo ?? '—'}`);
        console.log(`       email:    ${mascara(p.email)}`);
        console.log(`       cpf:      ${mascara(p.cpf)}`);
        console.log(`       status:   ${p.status ?? '—'}`);
      }
    } catch (e: any) {
      console.log(`  ${rotulo.padEnd(22)} → HTTP ${e.status ?? '?'}`);
    }
    await new Promise((r) => setTimeout(r, j.sleepMs));
  }

  // Quais cargos existem? Define se dá para isolar os docentes.
  console.log(`\n── cargos presentes (amostra de 600 perfis) ─────────\n`);
  const cargos = new Map<string, number>();
  let comEmail = 0;
  let vistos = 0;

  for (let pagina = 0; pagina < 3; pagina++) {
    const r = await j.get<any>('/api/v1/basicos/perfis', { pageSize: 200, currentPage: pagina });
    for (const p of r?.elements ?? []) {
      const c = (p.cargo ?? '(sem cargo)').toString().trim() || '(vazio)';
      cargos.set(c, (cargos.get(c) ?? 0) + 1);
      if (p.email) comEmail++;
      vistos++;
    }
    await new Promise((r) => setTimeout(r, j.sleepMs));
  }

  for (const [cargo, n] of [...cargos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${String(n).padStart(4)}  ${cargo}`);
  }
  console.log(`\n  perfis vistos: ${vistos} | com e-mail: ${comEmail}`);
}
