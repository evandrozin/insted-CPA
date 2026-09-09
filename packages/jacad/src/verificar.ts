/**
 * Diagnóstico: leitura da API JACAD — não grava nada, não toca no banco.
 * Confirma que endpoints, autenticação, paginação e parsing funcionam.
 *
 * Não imprime dados pessoais: de matrículas mostra só contagem e nomes de campo.
 */
import { JacadClient } from './client.js';

export async function verificar(j: JacadClient) {
  console.log('── organizações ──────────────────────────────');
  const orgs = await j.get<{ elements: any[] }>('/api/v1/basicos/organizacoes', { pageSize: 100 });
  if (orgs.elements?.[0]) {
    console.log(`  campos: ${Object.keys(orgs.elements[0]).sort().join(', ')}`);
  }
  for (const o of orgs.elements ?? []) console.log(`  ${JSON.stringify(o)}`);

  console.log('\n── períodos letivos (5 mais recentes) ────────');
  // idOrganizacao, não id — e a principal tem id 0 (cuidado com checagem falsy)
  const idOrg = orgs.elements?.[0]?.idOrganizacao;
  const per = await j.get<any>('/api/v1/academico/periodos-letivos/', {
    idOrg,
    pageSize: 200,
    currentPage: 0,
  });
  const periodos = (per.elements ?? [])
    .sort((a: any, b: any) => (b.ano ?? 0) - (a.ano ?? 0) || (b.semestre ?? 0) - (a.semestre ?? 0))
    .slice(0, 5);
  for (const p of periodos) {
    console.log(
      `  id ${String(p.idPeriodoLetivo).padStart(4)}  ${p.ano}.${p.semestre}  ${p.descricao ?? ''}  [${p.situacao ?? '—'}]`,
    );
  }
  console.log(`  total de períodos: ${per.elements?.length ?? 0} | totalPages: ${per.page?.totalPages}`);

  console.log('\n── cursos (primeiros 8) ─────────────────────');
  const cur = await j.get<any>('/api/v1/academico/cursos-base/', { pageSize: 200, currentPage: 0 });
  for (const c of (cur.elements ?? []).slice(0, 8)) {
    console.log(`  ${String(c.idCursoBase).padStart(4)}  ${c.nomeImpressao ?? c.nomeReduzido ?? ''}`);
  }
  console.log(`  total de cursos: ${cur.elements?.length ?? 0} | totalPages: ${cur.page?.totalPages}`);

  const alvo = periodos[0];
  if (!alvo) return;

  console.log(`\n── turmas ATIVAS do período ${alvo.idPeriodoLetivo} ──────`);
  const tur = await j.get<any>('/api/v1/academico/turmas', {
    turmaIdPeriodoLetivo: alvo.idPeriodoLetivo,
    turmaStatus: 'ATIVA',
    pageSize: 200,
    currentPage: 0,
  });
  for (const t of (tur.elements ?? []).slice(0, 6)) {
    console.log(
      `  ${String(t.idTurma).padStart(6)}  ${(t.turmaNome ?? '').slice(0, 40).padEnd(40)} ${t.turmaTurno ?? '—'}  ${t.turmaPeriodoItem ?? ''}`,
    );
  }
  console.log(`  turmas ativas: ${tur.elements?.length ?? 0} | totalPages: ${tur.page?.totalPages}`);

  console.log(`\n── matrículas do período ${alvo.idPeriodoLetivo} ─────────`);
  const mat = await j.get<any>('/api/v1/academico/matriculas', {
    idPeriodoLetivo: alvo.idPeriodoLetivo,
    pageSize: 200,
    currentPage: 0,
  });
  const els = mat.elements ?? [];
  console.log(`  nesta página: ${els.length} | totalPages: ${mat.page?.totalPages}`);
  if (els[0]) {
    console.log(`  campos disponíveis: ${Object.keys(els[0]).sort().join(', ')}`);
    const comEmail = els.filter((m: any) => m.alunoEmailInstitucional || m.alunoEmail).length;
    console.log(`  com e-mail preenchido: ${comEmail}/${els.length}`);
  }

  // ---- o ponto crítico: como vem o professor?
  const amostra = els[0];
  if (amostra) {
    console.log(`\n── disciplinas de UMA matrícula (amostra) ───`);
    const dis = await j.get<any>('/api/v1/academico/matricula-disciplina', {
      idMatricula: amostra.idMatricula,
      pageSize: 100,
    });
    const linhas = dis.elements ?? [];
    console.log(`  linhas: ${linhas.length}`);
    if (linhas[0]) {
      console.log(`  campos disponíveis: ${Object.keys(linhas[0]).sort().join(', ')}`);
      console.log('\n  disciplina / professor:');
      for (const d of linhas.slice(0, 8)) {
        console.log(`    ${(d.disciplina ?? '—').slice(0, 42).padEnd(42)} | ${d.professor ?? '(sem professor)'}`);
      }
      const idsDocente = Object.keys(linhas[0]).filter((k) => /prof|docent|colab/i.test(k));
      console.log(`\n  campos relacionados a docente: ${idsDocente.join(', ') || 'apenas "professor" (texto)'}`);
    }
  }
}

