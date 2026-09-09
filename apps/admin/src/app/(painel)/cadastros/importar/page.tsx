/**
 * Importação de dados.
 *
 * Hoje a carga vem toda do JACAD. A importação por planilha existe para o que
 * o JACAD não resolve — e o caso concreto já conhecido é a conciliação dos
 * docentes ambíguos. Em vez de uma tela de upload que não faz nada, esta
 * página mostra o estado real e aponta o caminho de cada situação.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';

export const dynamic = 'force-dynamic';

export default async function Importar() {
  let dados = {
    alunos: 0,
    professores: 0,
    professoresSemAcesso: 0,
    ambiguos: 0,
    ofertasSemModalidade: 0,
    ultimaSync: null as Date | null,
  };
  let erro = false;

  try {
    const [alunos, professores, semAcesso, ambiguos, semModalidade, log] = await Promise.all([
      prisma.user.count({ where: { role: 'ALUNO', deletadoEm: null } }),
      prisma.user.count({ where: { role: 'PROFESSOR', deletadoEm: null } }),
      prisma.user.count({ where: { role: 'PROFESSOR', status: 'INATIVO', deletadoEm: null } }),
      prisma.jacadDocenteConciliacao.count({ where: { status: { in: ['AMBIGUO', 'NAO_ENCONTRADO'] } } }),
      prisma.teachingAssignment.count({ where: { modalidade: 'NAO_INFORMADA' } }),
      prisma.jacadSyncLog.findFirst({ orderBy: { iniciadoEm: 'desc' } }),
    ]);
    dados = {
      alunos,
      professores,
      professoresSemAcesso: semAcesso,
      ambiguos,
      ofertasSemModalidade: semModalidade,
      ultimaSync: log?.concluidoEm ?? log?.iniciadoEm ?? null,
    };
  } catch {
    erro = true;
  }

  const dataHora = (d: Date | null) =>
    d ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(d) : '—';

  const pendencias = [
    {
      titulo: 'Docentes sem e-mail',
      valor: dados.professoresSemAcesso,
      descricao:
        'Entraram inativos e não acessam o próprio relatório nem respondem à autoavaliação. ' +
        'A maioria são homônimos que a conciliação não pôde decidir sozinha.',
      caminho: 'Planilha da secretaria com nome, CPF e e-mail institucional — conciliar por CPF resolve de vez.',
    },
    {
      titulo: 'Nomes ambíguos na conciliação',
      valor: dados.ambiguos,
      descricao:
        'Dois ou três perfis com o mesmo nome e CPFs diferentes. O importador não escolhe: ' +
        'errar aqui manda a avaliação de um professor para outra pessoa.',
      caminho: 'Decisão manual, ou a mesma planilha com CPF.',
    },
    {
      titulo: 'Ofertas sem modalidade',
      valor: dados.ofertasSemModalidade,
      descricao:
        'O JACAD não informou se a oferta é presencial ou EAD. Elas ficam fora dos blocos ' +
        'filtrados por modalidade — o aluno não recebe aquelas perguntas.',
      caminho: 'Preencher a modalidade dos cursos no JACAD e reimportar.',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Cadastros
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          Importar dados
        </h1>
        <p className="mt-2 max-w-2xl text-slate-500">
          A carga acadêmica vem toda do JACAD. Esta tela mostra o que já entrou e o que ficou
          pendente — as pendências abaixo são de cadastro na origem, não do sistema.
        </p>
      </header>

      {erro && (
        <p className="mt-6 rounded-lg border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600">
          Banco indisponível. Suba a infraestrutura com{' '}
          <code className="font-mono text-xs text-brand-navy">npm run infra:up</code>.
        </p>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-slate-100 sm:grid-cols-3">
        {[
          ['Alunos', dados.alunos.toLocaleString('pt-BR')],
          ['Professores', dados.professores.toLocaleString('pt-BR')],
          ['Última sincronização', dataHora(dados.ultimaSync)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="bg-white px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">
              {rotulo}
            </dt>
            <dd className="mt-1 font-brand text-lg font-semibold text-brand-navy tabular-nums">
              {valor}
            </dd>
          </div>
        ))}
      </dl>

      <section className="mt-10">
        <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
          Importar do JACAD
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          A sincronização roda por linha de comando, da máquina com IP liberado no JACAD.
          Acompanhe o estado de cada recurso em{' '}
          <Link href="/integracoes/jacad" className="font-semibold text-brand-teal hover:text-brand-teal-hover">
            Importar do JACAD
          </Link>
          .
        </p>
        <pre className="mt-3 overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white px-5 py-4 font-mono text-xs text-brand-navy">
{`npm run jacad -- sync tudo --periodo=<id>
npm run jacad -- conciliar-docentes --periodo=<id>
npm run jacad -- promover --periodo=<id>`}
        </pre>
      </section>

      <section className="mt-10">
        <h2 className="font-brand text-lg font-bold tracking-tight text-brand-navy">
          Pendências de cadastro
        </h2>
        <p className="mt-2 text-sm text-slate-500">
          Nenhuma delas impede abrir um ciclo, mas cada uma tira alguém de uma parte da avaliação.
        </p>

        <ul className="mt-4 flex flex-col gap-3">
          {pendencias.map((p) => (
            <li
              key={p.titulo}
              className={`rounded-2xl border px-5 py-4 ${
                p.valor > 0
                  ? 'border-brand-orange/30 bg-brand-orange/5'
                  : 'border-brand-navy/10 bg-white'
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold text-brand-navy">{p.titulo}</p>
                <span
                  className={`font-brand text-xl font-bold tabular-nums ${
                    p.valor > 0 ? 'text-brand-orange' : 'text-brand-teal'
                  }`}
                >
                  {p.valor.toLocaleString('pt-BR')}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-600">{p.descricao}</p>
              <p className="mt-2 text-xs text-slate-500">
                <span className="font-semibold uppercase tracking-[0.06em]">Caminho:</span>{' '}
                {p.caminho}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-dashed border-brand-navy/25 bg-white/60 px-5 py-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Importação por planilha
        </p>
        <p className="mt-2 text-sm text-slate-500">
          Entra na Fase 1 do roadmap, com pré-visualização de erros por linha antes de confirmar.
          O primeiro uso já está definido: a planilha de docentes com CPF e e-mail institucional,
          que resolve as duas primeiras pendências acima de uma vez.
        </p>
      </section>
    </div>
  );
}
