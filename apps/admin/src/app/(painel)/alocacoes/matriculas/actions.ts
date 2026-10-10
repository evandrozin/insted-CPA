'use server';

/**
 * Situação do aluno, pela tela de matrículas.
 *
 * O que vem do JACAD como inativo nem sempre está: aluno com a matrícula
 * regularizada depois da importação continua marcado como inativo aqui, e quem
 * está inativo não entra na geração de tarefas do ciclo.
 *
 * Toda mudança grava `statusManual`. É isso que impede a próxima importação de
 * desfazer o que a CPA decidiu — a promoção do JACAD respeita a marca e não
 * reescreve o status de quem foi editado à mão.
 *
 * Mudar o status NÃO coloca o aluno no ciclo que já está aberto: as tarefas são
 * geradas uma vez. Quem foi ativado depois entra por "Incluir quem ficou de
 * fora", na lista de respondentes do ciclo. Misturar as duas coisas aqui
 * mexeria no que está sendo respondido, e a tela de matrículas não é o lugar.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { SEM_EMAIL, lerFiltro, montarWhere } from './filtro';

type Novo = 'ATIVO' | 'INATIVO';
type Modo = 'marcadas' | 'filtro';

type Resultado = {
  alterados: number;
  jaEstavam: number;
  semEmail: number;
};

/**
 * Aplica o status a um conjunto de alunos.
 *
 * Ativar quem não tem e-mail real é recusado, como na tela de usuários: a conta
 * que o JACAD cria sem e-mail usa um endereço provisório, e quem fosse ativado
 * assim não receberia aviso nenhum. Fica contado à parte para a tela dizer
 * quantos — recusar em silêncio faria parecer que o lote inteiro passou.
 */
async function aplicar(studentIds: string[], novo: Novo): Promise<Resultado> {
  if (studentIds.length === 0) return { alterados: 0, jaEstavam: 0, semEmail: 0 };

  const alunos = await prisma.user.findMany({
    where: { id: { in: studentIds }, role: 'ALUNO', deletadoEm: null },
    select: { id: true, status: true, email: true },
  });

  const jaEstavam = alunos.filter((a) => a.status === novo).length;
  const candidatos = alunos.filter((a) => a.status !== novo);

  const barrados =
    novo === 'ATIVO' ? candidatos.filter((a) => a.email.endsWith(SEM_EMAIL)) : [];
  const barradosIds = new Set(barrados.map((a) => a.id));
  const alvos = candidatos.filter((a) => !barradosIds.has(a.id));

  if (alvos.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: alvos.map((a) => a.id) } },
      data: { status: novo, statusManual: true },
    });
  }

  return { alterados: alvos.length, jaEstavam, semEmail: barrados.length };
}

/**
 * Volta para a tela de onde veio, com o resumo na URL.
 *
 * O resumo carrega só números — nome de aluno não viaja na URL.
 */
function concluir(dados: FormData, novo: Novo, r: Resultado): never {
  revalidatePath('/alocacoes/matriculas');

  const destino = String(dados.get('volta') ?? '');
  const base =
    destino.startsWith('/alocacoes/matriculas') && !destino.startsWith('//')
      ? destino
      : '/alocacoes/matriculas';

  const resumo = [novo, r.alterados, r.semEmail, r.jaEstavam].join('.');
  const separador = base.includes('?') ? '&' : '?';
  redirect(`${base}${separador}ok=${resumo}`);
}

/** Liga ou desliga UM aluno — o botão de cada linha. */
export async function alternarAluno(studentId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const aluno = await prisma.user.findUnique({
    where: { id: studentId },
    select: { status: true, role: true },
  });
  if (!aluno || aluno.role !== 'ALUNO') throw new Error('Aluno não encontrado.');

  const novo: Novo = aluno.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';
  const r = await aplicar([studentId], novo);

  if (novo === 'ATIVO' && r.semEmail > 0) {
    throw new Error(
      'Este aluno está sem e-mail real. Informe o e-mail em Cadastros → Usuários antes de ativar: ' +
        'sem ele a pessoa não recebe aviso nenhum.',
    );
  }

  await prisma.auditLog.create({
    data: {
      acao: 'ALUNO_STATUS_MANUAL',
      entidade: 'User',
      entidadeId: studentId,
      dadosAntes: { status: aluno.status },
      dadosDepois: { status: novo, origem: 'matriculas' },
    },
  });

  concluir(dados, novo, r);
}

/**
 * Liga ou desliga vários alunos de uma vez.
 *
 * `marcadas`: as linhas selecionadas. `filtro`: tudo que casa com a aba e a
 * busca atuais, inclusive o que está em outras páginas — o `where` é
 * reconstruído aqui a partir de `q` e `f`, e o cliente nunca manda a lista de
 * alvos. Assim "aplicar a todos" não pode ser ampliado por quem montar a
 * requisição na mão.
 */
export async function definirStatusEmLote(
  novo: Novo,
  modo: Modo,
  dados: FormData,
): Promise<void> {
  const eu = await exigirPainel();

  if (novo !== 'ATIVO' && novo !== 'INATIVO') throw new Error('Situação inválida.');
  if (modo !== 'marcadas' && modo !== 'filtro') throw new Error('Modo inválido.');

  let matriculaIds: string[] | null = null;

  if (modo === 'marcadas') {
    matriculaIds = dados.getAll('ids').map(String).filter(Boolean);
    if (matriculaIds.length === 0) throw new Error('Nenhuma matrícula marcada.');
  }

  const q = String(dados.get('q') ?? '');
  const f = lerFiltro(dados.get('f'));

  const matriculas = await prisma.enrollment.findMany({
    where:
      modo === 'marcadas'
        ? { id: { in: matriculaIds! }, student: { deletadoEm: null } }
        : montarWhere(q, f),
    select: { studentId: true },
  });

  // Um aluno com duas matrículas aparece duas vezes na lista; conta uma só.
  const alunos = [...new Set(matriculas.map((m) => m.studentId))];
  const r = await aplicar(alunos, novo);

  await prisma.auditLog.create({
    data: {
      userId: eu.id,
      acao: 'ALUNO_STATUS_MANUAL_LOTE',
      entidade: 'User',
      dadosDepois: {
        status: novo,
        modo,
        filtro: f || null,
        busca: q || null,
        considerados: alunos.length,
        ...r,
      },
    },
  });

  concluir(dados, novo, r);
}
