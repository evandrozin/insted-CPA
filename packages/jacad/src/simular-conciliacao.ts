/**
 * Simulação da conciliação de docentes — não grava nada, não usa banco.
 *
 * Responde à pergunta que decide o desenho da avaliação docente:
 * *que fração dos professores conseguimos casar com um cadastro real?*
 *
 * Roda direto contra a API: coleta nomes de professor de uma amostra de
 * matrículas e tenta casar cada um em /basicos/perfis.
 */
import type { JacadClient } from './client.js';
import { dormir } from './client.js';
import { normalizarNome } from './conciliar-docentes.js';

export async function simularConciliacao(
  j: JacadClient,
  idPeriodoLetivo: number,
  amostraMatriculas = 40,
) {
  console.log(`── coletando professores (amostra de ${amostraMatriculas} matrículas) ──\n`);

  const mat = await j.get<any>('/api/v1/academico/matriculas', {
    idPeriodoLetivo,
    pageSize: amostraMatriculas,
    currentPage: 0,
  });

  const nomes = new Set<string>();
  for (const m of mat.elements ?? []) {
    const dis = await j.get<any>('/api/v1/academico/matricula-disciplina', {
      idMatricula: m.idMatricula,
      pageSize: 100,
    });
    for (const d of dis.elements ?? []) {
      const n = (d.professor ?? '').trim();
      if (n) nomes.add(n);
    }
    await dormir(j.sleepMs);
  }

  console.log(`  ${nomes.size} professores distintos\n`);
  console.log('── casando com /basicos/perfis ─────────────────────\n');

  const conciliados: string[] = [];
  const semEmail: string[] = [];
  const ambiguos: string[] = [];
  const naoEncontrados: string[] = [];

  for (const nome of [...nomes].sort()) {
    const resp = await j.get<any>('/api/v1/basicos/perfis', {
      search: nome,
      pageSize: 10,
      currentPage: 0,
    });

    const alvo = normalizarNome(nome);
    const exatos = (resp?.elements ?? []).filter(
      (p: any) => normalizarNome(String(p.nome ?? '')) === alvo,
    );

    if (exatos.length === 1) {
      conciliados.push(nome);
      if (!exatos[0].email) semEmail.push(nome);
    } else if (exatos.length > 1) {
      ambiguos.push(`${nome} (${exatos.length} perfis)`);
    } else {
      naoEncontrados.push(nome);
    }
    await dormir(j.sleepMs);
  }

  const total = nomes.size || 1;
  const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;

  console.log(`  ✅ conciliados ....... ${conciliados.length}  (${pct(conciliados.length)})`);
  console.log(`     …com e-mail ....... ${conciliados.length - semEmail.length}`);
  console.log(`  ⚠  ambíguos .......... ${ambiguos.length}  (${pct(ambiguos.length)})`);
  console.log(`  ✗  não encontrados ... ${naoEncontrados.length}  (${pct(naoEncontrados.length)})`);

  if (ambiguos.length) {
    console.log('\n  ambíguos:');
    for (const a of ambiguos.slice(0, 10)) console.log(`    · ${a}`);

    // Ambiguidade costuma ser a MESMA pessoa cadastrada duas vezes. Se os
    // candidatos compartilham CPF, dá para desempatar sem intervenção humana.
    console.log('\n  ── anatomia dos ambíguos ─────────────────────');
    let mesmoCpf = 0;
    let umAtivoSo = 0;

    for (const rotulo of ambiguos.slice(0, 8)) {
      const nome = rotulo.replace(/ \(\d+ perfis\)$/, '');
      const resp = await j.get<any>('/api/v1/basicos/perfis', {
        search: nome,
        pageSize: 10,
        currentPage: 0,
      });
      const alvo = normalizarNome(nome);
      const exatos = (resp?.elements ?? []).filter(
        (p: any) => normalizarNome(String(p.nome ?? '')) === alvo,
      );

      const cpfs = new Set(exatos.map((p: any) => String(p.cpf ?? '').replace(/\D/g, '')));
      const ativos = exatos.filter((p: any) => String(p.status ?? '').toUpperCase() === 'ATIVO');
      const comEmail = exatos.filter((p: any) => Boolean(p.email));

      if (cpfs.size === 1) mesmoCpf++;
      if (ativos.length === 1) umAtivoSo++;

      console.log(
        `    ${nome.slice(0, 34).padEnd(34)} cpfs:${cpfs.size} ativos:${ativos.length}/${exatos.length} c/email:${comEmail.length}`,
      );
    }

    const analisados = Math.min(ambiguos.length, 8);
    console.log(
      `\n    mesmo CPF (mesma pessoa duplicada): ${mesmoCpf}/${analisados}` +
        `\n    só um ATIVO: ${umAtivoSo}/${analisados}`,
    );
    if (mesmoCpf === analisados) {
      console.log(
        '\n    → todos os ambíguos são duplicatas da mesma pessoa: dá para\n' +
          '      desempatar por CPF automaticamente, sem decisão humana.',
      );
    }
  }
  if (naoEncontrados.length) {
    console.log('\n  não encontrados:');
    for (const n of naoEncontrados.slice(0, 10)) console.log(`    · ${n}`);
  }

  const acessoOk = conciliados.length - semEmail.length;
  console.log(
    `\n  → ${acessoOk} de ${nomes.size} docentes conseguiriam entrar no sistema (${pct(acessoOk)}).`,
  );
}
