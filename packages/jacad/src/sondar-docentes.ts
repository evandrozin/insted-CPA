/**
 * Sondagem: existe um identificador estável de DOCENTE na API?
 *
 * A promoção depende disso. Sem um id, professores são deduplicados por nome —
 * homônimos colidem e mudanças de grafia duplicam. Este diagnóstico responde:
 *
 *   1. `idDisciplinaProfessor` é estável por professor, ou por vínculo?
 *   2. existe algum endpoint de pessoas/colaboradores que liste docentes?
 *
 * Não grava nada. Não imprime e-mail nem documento de ninguém.
 */
import type { JacadClient } from './client.js';

/** Caminhos plausíveis, a testar contra a instância. */
const CANDIDATOS = [
  '/api/v1/basicos/perfis',
  '/api/v1/basicos/professores',
  '/api/v1/basicos/colaboradores',
  '/api/v1/basicos/pessoas',
  '/api/v1/academico/professores',
  '/api/v1/academico/docentes',
  '/api/v1/academico/disciplina-professor',
  '/api/v1/controle-acesso/usuarios',
];

export async function sondarDocentes(j: JacadClient, idPeriodoLetivo: number, amostra = 25) {
  // ---------------------------------------------------- 1. idDisciplinaProfessor
  console.log(`── idDisciplinaProfessor é estável? (amostra de ${amostra} matrículas) ──\n`);

  const mat = await j.get<any>('/api/v1/academico/matriculas', {
    idPeriodoLetivo,
    pageSize: amostra,
    currentPage: 0,
  });

  /** professor (nome) -> ids de vínculo distintos */
  const porProfessor = new Map<string, Set<number>>();
  /** id de vínculo -> nomes distintos (colisão seria grave) */
  const porVinculo = new Map<number, Set<string>>();

  for (const m of mat.elements ?? []) {
    const dis = await j.get<any>('/api/v1/academico/matricula-disciplina', {
      idMatricula: m.idMatricula,
      pageSize: 100,
    });

    for (const d of dis.elements ?? []) {
      const nome = (d.professor ?? '').trim();
      const id = d.idDisciplinaProfessor;
      if (!nome || id == null) continue;

      if (!porProfessor.has(nome)) porProfessor.set(nome, new Set());
      porProfessor.get(nome)!.add(id);

      if (!porVinculo.has(id)) porVinculo.set(id, new Set());
      porVinculo.get(id)!.add(nome);
    }
    await new Promise((r) => setTimeout(r, j.sleepMs));
  }

  const nomes = [...porProfessor.keys()];
  const umIdSo = nomes.filter((n) => porProfessor.get(n)!.size === 1).length;
  const variosIds = nomes.filter((n) => porProfessor.get(n)!.size > 1);
  const vinculosAmbiguos = [...porVinculo.entries()].filter(([, s]) => s.size > 1);

  console.log(`  professores distintos (por nome): ${nomes.length}`);
  console.log(`  com UM único idDisciplinaProfessor: ${umIdSo}`);
  console.log(`  com VÁRIOS ids: ${variosIds.length}`);
  for (const n of variosIds.slice(0, 5)) {
    console.log(`     · ${n} → ids ${[...porProfessor.get(n)!].join(', ')}`);
  }
  console.log(`  ids que apontam para nomes diferentes: ${vinculosAmbiguos.length}`);

  console.log(
    variosIds.length === 0
      ? '\n  ✅ o id parece identificar o PROFESSOR — usar como chave de dedup.'
      : '\n  ⚠ o id varia por disciplina/turma: identifica o VÍNCULO, não a pessoa.\n' +
          '    Serve para agrupar dentro de uma disciplina, mas não substitui um cadastro.',
  );

  // ---------------------------------------------------- 2. endpoints candidatos
  console.log('\n── endpoints de pessoas/docentes ────────────────────────\n');

  for (const caminho of CANDIDATOS) {
    try {
      const r = await j.get<any>(caminho, { pageSize: 3, currentPage: 0 });
      const els = r?.elements ?? [];
      const total = r?.page?.totalElements ?? els.length;
      console.log(`  ✅ ${caminho}  (${total} registros)`);
      if (els[0]) console.log(`       campos: ${Object.keys(els[0]).sort().join(', ')}`);
    } catch (e: any) {
      console.log(`  ✗  ${caminho}  → HTTP ${e.status ?? '?'}`);
    }
    await new Promise((r) => setTimeout(r, j.sleepMs));
  }
}
