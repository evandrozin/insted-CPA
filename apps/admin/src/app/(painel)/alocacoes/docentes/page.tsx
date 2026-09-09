import Link from 'next/link';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import {
  alternarAlocacaoAtiva,
  definirModalidadeAlocacao,
  trocarProfessor,
} from '../actions';

export const dynamic = 'force-dynamic';

const MODALIDADES = [
  { valor: 'NAO_INFORMADA', rotulo: '— sem definir —' },
  { valor: 'PRESENCIAL', rotulo: 'Presencial' },
  { valor: 'EAD', rotulo: 'EAD' },
  { valor: 'SEMIPRESENCIAL', rotulo: 'Semipresencial' },
];

const campo =
  'rounded-lg border border-brand-navy/15 bg-white px-2 py-1 text-[11px] text-brand-navy outline-none focus:border-brand-teal';
const btn =
  'rounded-lg border border-brand-navy/10 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover';

export default async function Docentes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const filtro = typeof sp.f === 'string' ? sp.f : '';
  const volta = `/alocacoes/docentes?${new URLSearchParams({
    ...(q ? { q } : {}),
    ...(filtro ? { f: filtro } : {}),
    p: String(pagina),
  })}`;

  const where = {
    ...(filtro === 'sem-modalidade' ? { modalidade: 'NAO_INFORMADA' as const } : {}),
    ...(filtro === 'editadas' ? { edicaoManual: true } : {}),
    ...(filtro === 'fora' ? { ativo: false } : {}),
    ...(q
      ? {
          OR: [
            { teacher: { nome: { contains: q, mode: 'insensitive' as const } } },
            { subject: { nome: { contains: q, mode: 'insensitive' as const } } },
            { class: { nome: { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [total, alocacoes, professores, contagens] = await Promise.all([
    prisma.teachingAssignment.count({ where }),
    prisma.teachingAssignment.findMany({
      where,
      orderBy: [{ teacher: { nome: 'asc' } }, { subject: { nome: 'asc' } }],
      skip: pular,
      take: POR_PAGINA,
      include: {
        teacher: { select: { id: true, nome: true, status: true } },
        subject: { select: { nome: true } },
        class: { select: { nome: true } },
        term: { select: { codigo: true } },
        _count: { select: { alunos: true } },
      },
    }),
    // Lista para a troca de docente. Só professores — a ação valida de novo.
    prisma.user.findMany({
      where: { role: 'PROFESSOR', deletadoEm: null },
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    }),
    Promise.all([
      prisma.teachingAssignment.count({ where: { modalidade: 'NAO_INFORMADA' } }),
      prisma.teachingAssignment.count({ where: { edicaoManual: true } }),
      prisma.teachingAssignment.count({ where: { ativo: false } }),
    ]),
  ]);

  const [semModalidade, editadas, fora] = contagens;

  // Quais alocações já têm resposta — essas ficam congeladas.
  const comResposta = new Set(
    (
      await prisma.responseSet.findMany({
        where: { targetRefId: { in: alocacoes.map((a) => a.id) } },
        select: { targetRefId: true },
        distinct: ['targetRefId'],
      })
    ).map((r) => r.targetRefId),
  );

  const abas = [
    { chave: '', rotulo: 'Todas', n: null },
    { chave: 'sem-modalidade', rotulo: 'Sem modalidade', n: semModalidade },
    { chave: 'editadas', rotulo: 'Corrigidas', n: editadas },
    { chave: 'fora', rotulo: 'Fora do ciclo', n: fora },
  ];

  return (
    <Lista
      eyebrow="Vínculos"
      titulo="Alocações docentes"
      descricao="Professor × disciplina × turma × semestre. É este vínculo que decide quem cada aluno avalia. Correções feitas aqui sobrevivem à próxima importação do JACAD."
      buscaPlaceholder="Buscar por professor, disciplina ou turma…"
      q={q}
      pagina={pagina}
      total={total}
      href="/alocacoes/docentes"
      colunas={[
        { titulo: 'Professor' },
        { titulo: 'Disciplina / turma' },
        { titulo: 'Sem.', estreita: true },
        { titulo: 'Modalidade', estreita: true },
        { titulo: 'Alunos', numerica: true, estreita: true },
        { titulo: 'No ciclo', estreita: true },
      ]}
      linhas={alocacoes.map((a) => {
        const congelada = comResposta.has(a.id);
        const semMod = a.modalidade === 'NAO_INFORMADA';

        return [
          <div className="min-w-56">
            <p className={a.ativo ? 'font-medium' : 'font-medium text-slate-400 line-through'}>
              {a.teacher.nome}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {a.teacher.status !== 'ATIVO' && <Etiqueta tom="alerta">sem acesso</Etiqueta>}
              {a.edicaoManual && <Etiqueta tom="ok">corrigida</Etiqueta>}
              {congelada && <Etiqueta tom="neutro">com respostas</Etiqueta>}
            </div>

            {!congelada && (
              <form className="mt-1.5 flex flex-wrap items-center gap-1">
                <input type="hidden" name="volta" value={volta} />
                <select name="teacherId" defaultValue={a.teacher.id} className={`${campo} max-w-44`}>
                  {professores.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
                <button formAction={trocarProfessor.bind(null, a.id)} className={btn}>
                  trocar
                </button>
              </form>
            )}
          </div>,

          <div>
            <p>{a.subject.nome}</p>
            <p className="mt-0.5 text-xs text-slate-400">{a.class.nome}</p>
          </div>,

          <span className="font-mono text-xs text-slate-400">{a.term.codigo}</span>,

          congelada ? (
            <Etiqueta tom={semMod ? 'alerta' : a.modalidade === 'EAD' ? 'ok' : 'neutro'}>
              {semMod ? 'sem modalidade' : a.modalidade.toLowerCase()}
            </Etiqueta>
          ) : (
            <form className="flex items-center gap-1">
              <input type="hidden" name="volta" value={volta} />
              <select name="modalidade" defaultValue={a.modalidade} className={campo}>
                {MODALIDADES.map((m) => (
                  <option key={m.valor} value={m.valor}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
              <button
                formAction={definirModalidadeAlocacao.bind(null, a.id)}
                className={
                  semMod
                    ? `${btn} border-brand-orange/40 bg-brand-orange/10 text-brand-orange`
                    : btn
                }
              >
                ok
              </button>
            </form>
          ),

          a._count.alunos,

          congelada ? (
            <Etiqueta tom="neutro">travada</Etiqueta>
          ) : (
            <form>
              <input type="hidden" name="volta" value={volta} />
              <button
                formAction={alternarAlocacaoAtiva.bind(null, a.id)}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  a.ativo
                    ? 'border-brand-teal/40 bg-brand-teal/10 text-brand-teal-hover hover:border-brand-orange/50 hover:bg-brand-orange/10 hover:text-brand-orange'
                    : 'border-brand-navy/10 bg-white text-slate-400 hover:border-brand-teal/40'
                }`}
                title={a.ativo ? 'Tirar esta oferta do ciclo' : 'Devolver ao ciclo'}
              >
                {a.ativo ? 'sim' : 'não'}
              </button>
            </form>
          ),
        ];
      })}
    >
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {abas.map((aba) => {
          const ativa = filtro === aba.chave;
          const href = `/alocacoes/docentes${aba.chave ? `?f=${aba.chave}` : ''}`;
          const alerta = aba.chave === 'sem-modalidade' && (aba.n ?? 0) > 0;
          return (
            <Link
              key={aba.chave || 'todas'}
              href={href}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                ativa
                  ? alerta
                    ? 'border-brand-orange bg-brand-orange/10 text-brand-orange'
                    : 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                  : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
              }`}
            >
              {aba.rotulo}
              {aba.n !== null && <span className="ml-1.5 tabular-nums text-slate-400">{aba.n}</span>}
            </Link>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        Depois de corrigir, gere as tarefas de novo no ciclo para as mudanças valerem. Alocações
        que já receberam resposta ficam travadas.
      </p>
    </Lista>
  );
}
