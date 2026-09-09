'use server';

/**
 * Edição de cadastros pelo painel.
 *
 * Estes campos são a exceção deliberada à regra "o JACAD é a fonte de verdade":
 * a CPA precisa decidir o que entra na avaliação, e o JACAD não tem esse
 * conceito. Por isso a promoção NÃO sobrescreve `ativo` nem `modalidadePadrao`
 * — se sobrescrevesse, o próximo sync desfaria a configuração do ciclo em
 * silêncio, e ninguém entenderia por que o questionário voltou a mudar.
 *
 * `statusManual` registra que alguém decidiu aqui, para que a origem do valor
 * fique visível na tela.
 */
import { revalidatePath } from 'next/cache';
import { exigirPainel } from '@/lib/sessao';
import { redirect } from 'next/navigation';
import { prisma, type Modalidade } from '@insted/database';

const MODALIDADES: Modalidade[] = ['PRESENCIAL', 'EAD', 'SEMIPRESENCIAL', 'NAO_INFORMADA'];

/** Cursos inativos saem da geração de alvos — e os alunos deles também. */
export async function alternarCursoAtivo(courseId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const atual = await prisma.course.findUnique({
    where: { id: courseId },
    select: { ativo: true },
  });
  if (!atual) throw new Error('Curso não encontrado.');

  await prisma.course.update({
    where: { id: courseId },
    data: { ativo: !atual.ativo, statusManual: true },
  });

  await prisma.auditLog.create({
    data: {
      acao: atual.ativo ? 'COURSE_DEACTIVATE' : 'COURSE_ACTIVATE',
      entidade: 'Course',
      entidadeId: courseId,
    },
  });

  revalidatePath('/cadastros/cursos');
  redirecionar(dados);
}

export async function alternarDisciplinaAtiva(subjectId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const atual = await prisma.subject.findUnique({
    where: { id: subjectId },
    select: { ativo: true },
  });
  if (!atual) throw new Error('Disciplina não encontrada.');

  await prisma.subject.update({
    where: { id: subjectId },
    data: { ativo: !atual.ativo, statusManual: true },
  });

  await prisma.auditLog.create({
    data: {
      acao: atual.ativo ? 'SUBJECT_DEACTIVATE' : 'SUBJECT_ACTIVATE',
      entidade: 'Subject',
      entidadeId: subjectId,
    },
  });

  revalidatePath('/cadastros/disciplinas');
  redirecionar(dados);
}

/**
 * Define a modalidade de uma disciplina e aplica às ofertas que estão sem.
 *
 * A modalidade real vive na oferta (`TeachingAssignment`), porque a mesma
 * disciplina pode ser presencial num semestre e EAD no outro. O que se define
 * aqui é o padrão usado quando o JACAD não informa — e ele é propagado na hora
 * para as ofertas ainda sem modalidade, senão a correção só teria efeito na
 * próxima importação.
 *
 * Ofertas que já têm modalidade vinda do JACAD não são tocadas.
 */
export async function definirModalidade(subjectId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const escolhida = String(dados.get('modalidade') ?? '') as Modalidade;
  if (!MODALIDADES.includes(escolhida)) throw new Error('Modalidade inválida.');

  const padrao = escolhida === 'NAO_INFORMADA' ? null : escolhida;

  await prisma.subject.update({
    where: { id: subjectId },
    data: { modalidadePadrao: padrao },
  });

  // Propaga só para o que está indefinido.
  const aplicadas = padrao
    ? await prisma.teachingAssignment.updateMany({
        where: { subjectId, modalidade: 'NAO_INFORMADA' },
        data: { modalidade: padrao },
      })
    : { count: 0 };

  await prisma.auditLog.create({
    data: {
      acao: 'SUBJECT_SET_MODALITY',
      entidade: 'Subject',
      entidadeId: subjectId,
      dadosDepois: { modalidade: escolhida, ofertasAtualizadas: aplicadas.count },
    },
  });

  revalidatePath('/cadastros/disciplinas');
  redirecionar(dados);
}

/**
 * Volta para a mesma página da listagem depois de agir.
 *
 * Sem isso, editar um registro na página 4 devolve o usuário à página 1 e ele
 * perde o lugar — o que, numa lista de 253 disciplinas, torna a correção em
 * massa inviável.
 */
function redirecionar(dados: FormData): void {
  const volta = String(dados.get('volta') ?? '');
  // Só caminhos internos: um valor vindo do formulário não pode virar um
  // redirecionamento para fora do painel.
  if (volta.startsWith('/') && !volta.startsWith('//')) redirect(volta);
}

/**
 * Cadastra à mão alguém que a importação nunca vai trazer.
 *
 * A CPA tem membros de fora dos quadros da Insted — a representação da
 * sociedade civil, prevista no SINAES — e eles não existem no JACAD. Sem esta
 * porta, a única forma de colocá-los no sistema seria pelo banco.
 *
 * Só perfis de respondente entram aqui. Acesso ao painel continua saindo de um
 * lugar só, Cadastros → Comissão, que exige ser administrador: duas portas para
 * privilégio é uma a mais do que dá para vigiar.
 */
export async function criarUsuarioManual(dados: FormData): Promise<void> {
  await exigirPainel();

  const nome = String(dados.get('nome') ?? '').trim();
  const email = String(dados.get('email') ?? '').trim().toLowerCase();
  const papel = String(dados.get('papel') ?? 'ALUNO');
  const matriculaInformada = String(dados.get('matricula') ?? '').trim();

  if (nome.length < 3) throw new Error('Informe o nome completo.');
  if (!email.includes('@')) throw new Error('Informe um e-mail válido.');
  if (papel !== 'ALUNO' && papel !== 'PROFESSOR') {
    throw new Error('Perfil inválido. Acesso ao painel se cadastra em Cadastros → Comissão.');
  }

  // Sem matrícula informada, gera uma com prefixo próprio. O prefixo não é
  // enfeite: garante que uma reimportação do JACAD, que casa por matrícula,
  // jamais encontre este cadastro e o sobrescreva.
  const matricula = (
    matriculaInformada || `EXT-${Date.now().toString(36).toUpperCase()}`
  ).slice(0, 40);

  const conflito = await prisma.user.findFirst({
    where: { OR: [{ email }, { matricula }] },
    select: { matricula: true, email: true, nome: true },
  });
  if (conflito) {
    throw new Error(
      conflito.email === email
        ? `Já existe cadastro com este e-mail: ${conflito.nome} (${conflito.matricula}).`
        : `A matrícula ${matricula} já pertence a ${conflito.nome}.`,
    );
  }

  const criado = await prisma.user.create({
    data: {
      nome,
      email,
      matricula,
      role: papel,
      status: 'ATIVO',
      // Sem senha: a pessoa define a dela no primeiro acesso, conferindo
      // matrícula e e-mail — o mesmo caminho de quem veio do JACAD.
      senhaHash: '',
      senhaProvisoria: false,
      criadoManualmente: true,
    },
    select: { id: true, matricula: true },
  });

  await prisma.auditLog.create({
    data: {
      acao: 'USUARIO_CRIADO_MANUAL',
      entidade: 'User',
      entidadeId: criado.id,
      dadosDepois: { nome, email, papel, matricula: criado.matricula },
    },
  });

  revalidatePath('/cadastros/usuarios');
  redirect(`/cadastros/usuarios?papel=${papel}&ok=${encodeURIComponent(criado.matricula)}`);
}
