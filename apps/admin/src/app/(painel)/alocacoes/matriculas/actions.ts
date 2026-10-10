'use server';

/**
 * Situação da matrícula — e do aluno, quando for preciso — pela tela de
 * matrículas.
 *
 * A UNIDADE É A MATRÍCULA, não o aluno. A primeira versão desta tela agia no
 * status do aluno, e um aluno com duas matrículas no semestre mudava as duas
 * linhas de uma vez. Só que a linha é que importa: quem decide a turma e o
 * curso carimbados na resposta — e o recorte da adesão — é a matrícula ATIVA
 * mais recente. Duas ativas e a resposta cai na turma que a comissão não
 * escolheu.
 *
 * Por isso:
 *
 * - INATIVAR uma linha desliga só aquela matrícula. O aluno continua ativo.
 * - ATIVAR uma linha liga aquela matrícula e, se o aluno estava inativo, liga
 *   o aluno também (sem isso ele não é elegível a ciclo nenhum). Nesse caso as
 *   OUTRAS matrículas dele no mesmo semestre ficam inativas — a CPA clicou em
 *   uma, e é uma que vale. A tela diz quantas, e religar é um clique.
 * - Em lote não há essa desativação das irmãs: a seleção explícita decide, e
 *   quem marcou as duas linhas quer as duas ativas.
 *
 * Toda mudança grava `edicaoManual` (matrícula) e `statusManual` (aluno). É isso
 * que impede a próxima importação do JACAD de religar o que a CPA desligou.
 *
 * Mudar a situação NÃO mexe no ciclo que já está aberto: as tarefas são geradas
 * uma vez. Quem foi ativado depois entra por "Incluir quem ficou de fora".
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { SEM_EMAIL, lerFiltro, montarWhere } from './filtro';

type Novo = 'ATIVO' | 'INATIVO';
type Modo = 'marcadas' | 'filtro';

type Resultado = {
  /** Matrículas que mudaram de situação. */
  matriculas: number;
  /** Alunos que passaram de inativo a ativo junto. */
  alunos: number;
  /** Outras matrículas do mesmo aluno, desativadas por consequência. */
  irmas: number;
  /** Ficaram de fora por o aluno não ter e-mail real. */
  semEmail: number;
  /** Já estavam na situação pedida. */
  jaEstavam: number;
  /** Alunos que terminaram com mais de uma matrícula ativa no semestre. */
  duplas: number;
};

const VAZIO: Resultado = {
  matriculas: 0,
  alunos: 0,
  irmas: 0,
  semEmail: 0,
  jaEstavam: 0,
  duplas: 0,
};

/**
 * Quantos dos alunos tocados ficaram com duas matrículas ativas no mesmo
 * semestre. Não é erro — há quem curse duas turmas de verdade —, mas é
 * exatamente a situação em que a turma da resposta é decidida pela mais recente,
 * e a comissão precisa saber.
 */
async function contarDuplas(studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0;

  const linhas = await prisma.$queryRaw<{ total: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS total
      FROM (
        SELECT e."studentId", sc."termId"
          FROM enrollments e
          JOIN school_classes sc ON sc.id = e."classId"
         WHERE e."studentId" = ANY(${studentIds}::text[])
           AND e.ativo = true
         GROUP BY e."studentId", sc."termId"
        HAVING COUNT(*) > 1
      ) duplas
  `);

  return linhas[0]?.total ?? 0;
}

/**
 * Liga matrículas e, quando preciso, o aluno.
 *
 * `desativarIrmas` só vale para quem ESTAVA inativo: aluno já ativo que tem uma
 * matrícula desligada e volta a ligá-la não tem as outras tocadas — não há
 * ambiguidade nova, só uma matrícula que voltou.
 */
async function ativar(
  matriculaIds: string[],
  opcoes: { desativarIrmas: boolean },
): Promise<Resultado> {
  if (matriculaIds.length === 0) return { ...VAZIO };

  const linhas = await prisma.enrollment.findMany({
    where: { id: { in: matriculaIds }, student: { deletadoEm: null, role: 'ALUNO' } },
    select: {
      id: true,
      ativo: true,
      studentId: true,
      class: { select: { termId: true } },
      student: { select: { status: true, email: true } },
    },
  });

  const barradas = linhas.filter(
    (l) => l.student.status === 'INATIVO' && l.student.email.endsWith(SEM_EMAIL),
  );
  const barradasIds = new Set(barradas.map((l) => l.id));
  const validas = linhas.filter((l) => !barradasIds.has(l.id));

  const jaEstavam = validas.filter((l) => l.ativo && l.student.status === 'ATIVO').length;
  const aMudar = validas.filter((l) => !(l.ativo && l.student.status === 'ATIVO'));

  const alunosInativos = [
    ...new Set(aMudar.filter((l) => l.student.status === 'INATIVO').map((l) => l.studentId)),
  ];

  // Irmãs: outras matrículas ATIVAS do mesmo aluno, no mesmo semestre, que não
  // estão sendo ligadas agora. Só dos alunos que estavam inativos.
  let irmasIds: string[] = [];
  if (opcoes.desativarIrmas && alunosInativos.length > 0) {
    const semestres = [
      ...new Set(
        aMudar.filter((l) => alunosInativos.includes(l.studentId)).map((l) => l.class.termId),
      ),
    ];
    const irmas = await prisma.enrollment.findMany({
      where: {
        studentId: { in: alunosInativos },
        id: { notIn: matriculaIds },
        ativo: true,
        class: { termId: { in: semestres } },
      },
      select: { id: true },
    });
    irmasIds = irmas.map((i) => i.id);
  }

  await prisma.$transaction(async (tx) => {
    if (aMudar.length > 0) {
      await tx.enrollment.updateMany({
        where: { id: { in: aMudar.map((l) => l.id) } },
        data: { ativo: true, edicaoManual: true },
      });
    }
    if (alunosInativos.length > 0) {
      await tx.user.updateMany({
        where: { id: { in: alunosInativos } },
        data: { status: 'ATIVO', statusManual: true },
      });
    }
    if (irmasIds.length > 0) {
      await tx.enrollment.updateMany({
        where: { id: { in: irmasIds } },
        data: { ativo: false, edicaoManual: true },
      });
    }
  });

  const tocados = [...new Set(validas.map((l) => l.studentId))];

  return {
    matriculas: aMudar.length,
    alunos: alunosInativos.length,
    irmas: irmasIds.length,
    semEmail: barradas.length,
    jaEstavam,
    duplas: await contarDuplas(tocados),
  };
}

/** Desliga matrículas. O aluno não é tocado. */
async function inativar(matriculaIds: string[]): Promise<Resultado> {
  if (matriculaIds.length === 0) return { ...VAZIO };

  const linhas = await prisma.enrollment.findMany({
    where: { id: { in: matriculaIds }, student: { deletadoEm: null, role: 'ALUNO' } },
    select: { id: true, ativo: true, studentId: true },
  });

  const aMudar = linhas.filter((l) => l.ativo);

  if (aMudar.length > 0) {
    await prisma.enrollment.updateMany({
      where: { id: { in: aMudar.map((l) => l.id) } },
      data: { ativo: false, edicaoManual: true },
    });
  }

  return {
    ...VAZIO,
    matriculas: aMudar.length,
    jaEstavam: linhas.length - aMudar.length,
  };
}

/**
 * Volta para a tela de onde veio, com o resumo na URL.
 *
 * Só números — nome de aluno não viaja na URL.
 */
function concluir(dados: FormData, novo: Novo, r: Resultado): never {
  revalidatePath('/alocacoes/matriculas');

  const destino = String(dados.get('volta') ?? '');
  const base =
    destino.startsWith('/alocacoes/matriculas') && !destino.startsWith('//')
      ? destino
      : '/alocacoes/matriculas';

  const resumo = [novo, r.matriculas, r.alunos, r.irmas, r.semEmail, r.jaEstavam, r.duplas].join(
    '.',
  );
  const separador = base.includes('?') ? '&' : '?';
  redirect(`${base}${separador}ok=${resumo}`);
}

/** O botão de cada linha: liga ou desliga ESSA matrícula. */
export async function alternarMatricula(matriculaId: string, dados: FormData): Promise<void> {
  const eu = await exigirPainel();

  const m = await prisma.enrollment.findUnique({
    where: { id: matriculaId },
    select: { ativo: true, student: { select: { status: true, role: true } } },
  });
  if (!m || m.student.role !== 'ALUNO') throw new Error('Matrícula não encontrada.');

  // "Efetivamente ativa": a matrícula e o aluno. Matrícula ligada de aluno
  // inativo conta como desligada — é o caso das 81 que vieram inativas.
  const efetiva = m.ativo && m.student.status === 'ATIVO';
  const novo: Novo = efetiva ? 'INATIVO' : 'ATIVO';

  const r = novo === 'ATIVO' ? await ativar([matriculaId], { desativarIrmas: true }) : await inativar([matriculaId]);

  if (novo === 'ATIVO' && r.semEmail > 0) {
    throw new Error(
      'Este aluno está sem e-mail real. Informe o e-mail em Cadastros → Usuários antes de ativar: ' +
        'sem ele a pessoa não recebe aviso nenhum.',
    );
  }

  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'MATRICULA_STATUS_MANUAL',
      entidade: 'Enrollment',
      entidadeId: matriculaId,
      dadosAntes: { matriculaAtiva: m.ativo, alunoStatus: m.student.status },
      dadosDepois: { situacao: novo, ...r },
    },
  });

  concluir(dados, novo, r);
}

/**
 * Liga ou desliga várias matrículas de uma vez.
 *
 * `marcadas`: as linhas selecionadas. `filtro`: tudo que casa com a aba e a
 * busca atuais, inclusive o que está em outras páginas — o `where` é
 * reconstruído aqui a partir de `q` e `f`, e o cliente nunca manda a lista de
 * alvos. Assim "aplicar a todos" não pode ser ampliado por quem montar a
 * requisição na mão.
 */
export async function definirMatriculasEmLote(
  novo: Novo,
  modo: Modo,
  dados: FormData,
): Promise<void> {
  const eu = await exigirPainel();

  if (novo !== 'ATIVO' && novo !== 'INATIVO') throw new Error('Situação inválida.');
  if (modo !== 'marcadas' && modo !== 'filtro') throw new Error('Modo inválido.');

  const q = String(dados.get('q') ?? '');
  const f = lerFiltro(dados.get('f'));

  let ids: string[];
  if (modo === 'marcadas') {
    ids = dados.getAll('ids').map(String).filter(Boolean);
    if (ids.length === 0) throw new Error('Nenhuma matrícula marcada.');
  } else {
    const achadas = await prisma.enrollment.findMany({
      where: montarWhere(q, f),
      select: { id: true },
    });
    ids = achadas.map((a) => a.id);
  }

  // Sem desativar irmãs: quem marcou as duas linhas quer as duas ativas, e
  // "ativar o filtro" não pode decidir sozinho qual matrícula de cada aluno vale.
  const r =
    novo === 'ATIVO' ? await ativar(ids, { desativarIrmas: false }) : await inativar(ids);

  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'MATRICULA_STATUS_MANUAL_LOTE',
      entidade: 'Enrollment',
      dadosDepois: {
        situacao: novo,
        modo,
        filtro: f || null,
        busca: q || null,
        considerados: ids.length,
        ...r,
      },
    },
  });

  concluir(dados, novo, r);
}
