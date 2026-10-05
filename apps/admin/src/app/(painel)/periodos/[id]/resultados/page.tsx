/**
 * Resultados de um ciclo — ponto de saída dos dados para a CPA.
 *
 * Mostra o tamanho do que foi coletado e entrega os arquivos. A análise
 * acontece na planilha: montar gráfico aqui seria refazer, pior, o que o Excel
 * já faz — e a CPA precisa do dado bruto para o relatório oficial.
 *
 * O que esta tela NUNCA mostra é quem respondeu o quê. Quem respondeu está na
 * lista nominal, que serve à cobrança; o que foi respondido está aqui. São
 * tabelas sem chave entre si, e as duas telas existem separadas de propósito.
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

const numero = (n: number) => new Intl.NumberFormat('pt-BR').format(n);

export default async function Resultados({ params }: { params: Promise<{ id: string }> }) {
  await exigirPainel();
  const { id } = await params;

  const ciclo = await prisma.evaluationPeriod.findUnique({
    where: { id },
    select: { id: true, nome: true, ano: true, status: true },
  });
  if (!ciclo) notFound();

  const [conjuntos, respostas, comentarios, concluidas, tarefas] = await Promise.all([
    prisma.responseSet.count({ where: { periodId: id } }),
    prisma.answer.count({ where: { responseSet: { periodId: id } } }),
    prisma.answer.count({
      where: {
        responseSet: { periodId: id },
        question: { tipo: 'TEXTO_LIVRE' },
        valorTexto: { not: null },
      },
    }),
    prisma.evaluationTask.count({ where: { periodId: id, status: 'CONCLUIDA' } }),
    prisma.evaluationTask.count({ where: { periodId: id } }),
  ]);

  const adesao = tarefas > 0 ? Math.round((concluidas / tarefas) * 100) : 0;

  const arquivos = [
    {
      formato: 'longo',
      titulo: 'Respostas — uma linha por resposta',
      descricao:
        'Cada linha é uma pergunta respondida, com o alvo avaliado e o recorte de curso e turma. É o formato para tabela dinâmica: filtra por bloco, por professor, por curso.',
    },
    {
      formato: 'largo',
      titulo: 'Respostas — uma linha por card',
      descricao:
        'Uma linha por card respondido e uma coluna por pergunta, como a planilha do Google Forms. Bom para olhar; ruim para cruzar.',
    },
    {
      formato: 'comentarios',
      titulo: 'Comentários abertos',
      descricao:
        'Só o texto livre, em arquivo separado — é a parte que pode identificar alguém sem querer, e não deve circular junto com os números.',
    },
  ];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 lg:px-8">
      <Link
        href={`/periodos/${ciclo.id}`}
        className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
      >
        ← {ciclo.nome}
      </Link>

      <header className="mt-4">
        <h1 className="font-brand text-3xl font-bold tracking-tight text-brand-navy">Resultados</h1>
        <p className="mt-2 text-slate-500">
          {ciclo.ano} · ciclo {ciclo.status.toLowerCase()}
        </p>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Cards respondidos', valor: numero(conjuntos) },
          { rotulo: 'Respostas', valor: numero(respostas) },
          { rotulo: 'Comentários', valor: numero(comentarios) },
          { rotulo: 'Adesão', valor: `${adesao}%` },
        ].map((c) => (
          <div
            key={c.rotulo}
            className="rounded-2xl border border-brand-navy/10 bg-white px-4 py-4"
          >
            <p className="font-brand text-2xl font-bold tabular-nums text-brand-navy">{c.valor}</p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-slate-400">
              {c.rotulo}
            </p>
          </div>
        ))}
      </section>

      <p className="mt-3 text-xs text-slate-400">
        {numero(concluidas)} de {numero(tarefas)} respondentes concluíram.
      </p>

      {conjuntos === 0 ? (
        <p className="mt-8 rounded-2xl border border-brand-navy/10 bg-white px-5 py-6 text-sm text-slate-500">
          Ainda não há respostas enviadas neste ciclo. Os arquivos aparecem aqui assim que o
          primeiro envio chegar.
        </p>
      ) : (
        <section className="mt-8 flex flex-col gap-3">
          {arquivos.map((a) => (
            <div
              key={a.formato}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-navy/10 bg-white px-5 py-5"
            >
              <div className="min-w-0 flex-1">
                <p className="font-brand text-sm font-bold text-brand-navy">{a.titulo}</p>
                <p className="mt-1 text-xs text-slate-500">{a.descricao}</p>
              </div>
              <a
                href={`/periodos/${ciclo.id}/resultados/csv?formato=${a.formato}`}
                className="shrink-0 rounded-xl bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
              >
                Baixar planilha
              </a>
            </div>
          ))}
        </section>
      )}

      <section className="mt-8 rounded-2xl border border-brand-navy/10 bg-brand-light px-5 py-5 text-xs leading-relaxed text-slate-500">
        <p className="font-brand text-sm font-bold text-brand-navy">Sobre o anonimato</p>
        <p className="mt-2">
          Nenhum arquivo traz quem respondeu, e não existe no banco uma chave que ligue resposta a
          pessoa. A data sai como dia, não como horário: com precisão de segundo, bastaria comparar
          com o registro de conclusão para remontar quem respondeu o quê.
        </p>
        <p className="mt-2">
          O que sai é o recorte de <strong>curso e turma</strong> de quem respondeu, porque é o que
          permite comparar. Em turma pequena, esse recorte somado a um comentário aberto pode
          estreitar bastante o cerco — por isso os comentários vêm em arquivo separado. Trate os
          dois como documento interno da comissão.
        </p>
      </section>
    </div>
  );
}
