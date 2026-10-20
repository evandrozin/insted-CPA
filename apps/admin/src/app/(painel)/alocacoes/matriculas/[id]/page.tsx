import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@insted/database';
import { Etiqueta } from '@/components/Lista';
import {
  SELECAO_INSCRICAO,
  disciplinasDaTurma,
  type Inscricao,
} from '@/lib/disciplinas-matricula';

export const dynamic = 'force-dynamic';

const MODALIDADE: Record<string, string> = {
  PRESENCIAL: 'Presencial',
  SEMIPRESENCIAL: 'Semipresencial',
  EAD: 'EAD',
  NAO_INFORMADA: 'Não informada',
};

/**
 * Disciplinas de um aluno, matrícula por matrícula.
 *
 * Existe porque a lista de matrículas só mostra um número. Quando o aluno tem
 * duas matrículas e uma está inativa, a CPA precisa ver QUAL disciplina vem de
 * qual matrícula e se ela vira card — sem isso, o card errado só aparece
 * quando o aluno o recebe.
 */
export default async function DisciplinasDaMatricula({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const matricula = await prisma.enrollment.findUnique({
    where: { id },
    select: {
      studentId: true,
      student: { select: { nome: true, matricula: true, status: true, email: true } },
    },
  });
  if (!matricula) notFound();

  const [matriculas, inscricoes] = await Promise.all([
    prisma.enrollment.findMany({
      where: { studentId: matricula.studentId },
      select: {
        id: true,
        ativo: true,
        classId: true,
        class: {
          select: {
            nome: true,
            turno: true,
            course: { select: { nome: true, ativo: true } },
            term: { select: { codigo: true, ano: true, semestre: true } },
          },
        },
      },
    }),
    prisma.studentSubject.findMany({
      where: { studentId: matricula.studentId },
      select: SELECAO_INSCRICAO,
    }),
  ]);

  // Esta matrícula primeiro; o resto, do semestre mais recente ao mais antigo.
  const ordenadas = [...matriculas].sort(
    (a, b) =>
      Number(b.id === id) - Number(a.id === id) ||
      b.class.term.ano - a.class.term.ano ||
      b.class.term.semestre - a.class.term.semestre,
  );

  // Inscrições em turma onde o aluno não tem matrícula (optativa, DP).
  const turmasComMatricula = new Set(matriculas.map((m) => m.classId));
  const soltas = inscricoes.filter((i) => !turmasComMatricula.has(i.assignment.classId));

  const nomeDeCurso = (cursoDaDisciplina: string | null | undefined, cursoDaTurma: string) =>
    cursoDaDisciplina && cursoDaDisciplina !== cursoDaTurma ? (
      <span className="text-slate-500">{cursoDaDisciplina}</span>
    ) : (
      <span className="text-slate-300">—</span>
    );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 lg:px-8">
      <Link
        href={`/alocacoes/matriculas?q=${encodeURIComponent(matricula.student.matricula)}`}
        className="text-xs font-semibold text-brand-teal hover:text-brand-teal-hover"
      >
        ← voltar às matrículas
      </Link>

      <header className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          Vínculos · Matrículas
        </p>
        <h1 className="mt-2 font-brand text-3xl font-bold tracking-tight text-brand-navy">
          {matricula.student.nome}
        </h1>
        <p className="mt-2 text-slate-500">
          <span className="font-mono text-xs">{matricula.student.matricula}</span>
          {matricula.student.status !== 'ATIVO' && (
            <span className="ml-2">
              <Etiqueta tom="apagado">{matricula.student.status.toLowerCase()}</Etiqueta>
            </span>
          )}
        </p>
        <p className="mt-3 max-w-3xl text-sm text-slate-500">
          Cada disciplina abaixo vem de uma matrícula do aluno. Só vira card de professor quando
          a inscrição, a oferta, a disciplina e o curso dela estão ativos <em>e</em> a matrícula
          da turma não está inativa. A coluna <strong>Card</strong> diz o resultado e, quando não
          gera, o motivo.
        </p>
      </header>

      {ordenadas.map((m) => {
        const { todas, comCard } = disciplinasDaTurma(inscricoes, m.classId, m.ativo);
        const atual = m.id === id;
        return (
          <section
            key={m.id}
            className={`mt-8 rounded-2xl border bg-white ${
              atual ? 'border-brand-teal/40' : 'border-brand-navy/10'
            }`}
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-5 py-4">
              <h2 className="font-brand text-lg font-bold text-brand-navy">{m.class.course.nome}</h2>
              <span className="text-sm text-slate-500">{m.class.nome}</span>
              <span className="font-mono text-xs text-slate-400">{m.class.term.codigo}</span>
              {m.ativo ? (
                <Etiqueta tom="ok">matrícula ativa</Etiqueta>
              ) : (
                <Etiqueta tom="alerta">matrícula inativa</Etiqueta>
              )}
              {!m.class.course.ativo && <Etiqueta tom="alerta">curso inativo</Etiqueta>}
              {atual && <Etiqueta tom="neutro">a que você abriu</Etiqueta>}
              <span className="ml-auto text-xs text-slate-500 tabular-nums">
                {comCard} de {todas.length} {todas.length === 1 ? 'disciplina gera' : 'disciplinas geram'}{' '}
                card
              </span>
            </div>

            {!m.ativo && todas.length > 0 && (
              <p className="border-b border-slate-100 bg-brand-orange/5 px-5 py-2 text-xs text-brand-orange">
                Esta matrícula está inativa: nenhuma das disciplinas dela gera card de professor.
                Ative-a na lista de matrículas se o aluno cursa este curso.
              </p>
            )}

            <Tabela
              vazio="Nenhuma disciplina vinculada a esta matrícula."
              linhas={todas.map(({ inscricao: i, motivo }) => ({
                chave: i.id,
                disciplina: i.assignment.subject.nome,
                curso: nomeDeCurso(i.assignment.subject.course?.nome, m.class.course.nome),
                professor: i.assignment.teacher.nome,
                modalidade: i.assignment.modalidade,
                semestre: i.assignment.term.codigo,
                motivo,
              }))}
            />
          </section>
        );
      })}

      {soltas.length > 0 && (
        <section className="mt-8 rounded-2xl border border-brand-navy/10 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="font-brand text-lg font-bold text-brand-navy">
              Sem matrícula na turma da disciplina
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Optativas e dependências: o aluno está inscrito na disciplina, mas não tem matrícula
              na turma que a oferece. Continuam valendo para o card.
            </p>
          </div>
          <Tabela
            vazio=""
            linhas={ordenarSoltas(soltas).map((i) => ({
              chave: i.id,
              disciplina: i.assignment.subject.nome,
              curso: nomeDeCurso(i.assignment.subject.course?.nome, ''),
              professor: i.assignment.teacher.nome,
              modalidade: i.assignment.modalidade,
              semestre: i.assignment.term.codigo,
              motivo: disciplinasDaTurma([i], i.assignment.classId, null).todas[0].motivo,
            }))}
          />
        </section>
      )}
    </div>
  );
}

function ordenarSoltas(l: Inscricao[]) {
  return [...l].sort(
    (a, b) =>
      b.assignment.term.ano - a.assignment.term.ano ||
      b.assignment.term.semestre - a.assignment.term.semestre ||
      a.assignment.subject.nome.localeCompare(b.assignment.subject.nome, 'pt-BR'),
  );
}

type LinhaDisciplina = {
  chave: string;
  disciplina: string;
  curso: React.ReactNode;
  professor: string;
  modalidade: string;
  semestre: string;
  motivo: string | null;
};

function Tabela({ linhas, vazio }: { linhas: LinhaDisciplina[]; vazio: string }) {
  if (linhas.length === 0) {
    return vazio ? <p className="px-5 py-6 text-sm text-slate-400">{vazio}</p> : null;
  }
  const th =
    'px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400';
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100">
            <th className={th}>Disciplina</th>
            <th className={th}>Curso da disciplina</th>
            <th className={th}>Professor</th>
            <th className={th}>Modalidade</th>
            <th className={th}>Semestre</th>
            <th className={th}>Card</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.chave} className="border-b border-slate-50 last:border-0 hover:bg-brand-light/50">
              <td className="px-4 py-2.5 align-top font-medium text-brand-navy">{l.disciplina}</td>
              <td className="px-4 py-2.5 align-top">{l.curso}</td>
              <td className="px-4 py-2.5 align-top text-slate-500">{l.professor}</td>
              <td className="whitespace-nowrap px-4 py-2.5 align-top">
                <Etiqueta tom={l.modalidade === 'NAO_INFORMADA' ? 'alerta' : 'neutro'}>
                  {MODALIDADE[l.modalidade] ?? l.modalidade}
                </Etiqueta>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 align-top font-mono text-xs text-slate-400">
                {l.semestre}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 align-top">
                {l.motivo === null ? (
                  <Etiqueta tom="ok">gera card</Etiqueta>
                ) : (
                  <span className="inline-flex items-center gap-2">
                    <Etiqueta tom="apagado">sem card</Etiqueta>
                    <span className="text-xs text-slate-500">{l.motivo}</span>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
