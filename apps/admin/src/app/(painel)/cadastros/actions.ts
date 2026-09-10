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

/**
 * Ativa ou inativa um usuário, e marca a decisão como manual.
 *
 * A marca não é detalhe: a promoção reescreve o status do aluno a cada
 * importação e o do docente sempre que a conciliação resolve o nome. Sem
 * `statusManual`, ativar um professor que veio errado do JACAD duraria até a
 * próxima rodada — e ninguém ligaria uma coisa à outra.
 *
 * O que muda ao ativar um docente: ele passa a entrar no sistema e a receber
 * a própria autoavaliação. Ser avaliado pelos alunos não depende disso — a
 * geração de alvos usa a alocação, não o status de quem leciona.
 */
export async function alternarUsuarioAtivo(userId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nome: true, status: true, role: true, email: true },
  });
  if (!user) throw new Error('Usuário não encontrado.');

  const novo = user.status === 'ATIVO' ? 'INATIVO' : 'ATIVO';

  // Ativar quem não tem e-mail real cria uma conta que não entra: o login
  // por primeiro acesso confere o e-mail do cadastro.
  if (novo === 'ATIVO' && user.email.endsWith('@sem-email.insted.local')) {
    throw new Error(
      `${user.nome} está sem e-mail real. Informe o e-mail institucional antes de ativar — ` +
        'sem ele a pessoa não consegue fazer o primeiro acesso.',
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: { status: novo, statusManual: true },
  });

  await prisma.auditLog.create({
    data: {
      acao: 'USUARIO_STATUS_MANUAL',
      entidade: 'User',
      entidadeId: userId,
      dadosAntes: { status: user.status },
      dadosDepois: { status: novo, nome: user.nome, papel: user.role },
    },
  });

  revalidatePath('/cadastros/usuarios');
}

/**
 * Define o e-mail institucional de quem veio sem.
 *
 * O JACAD devolve o docente só como nome em texto; sem e-mail ele entra
 * INATIVO e não acessa nada. Este é o conserto que a secretaria faz caso a
 * caso, enquanto a planilha definitiva não vem.
 */
export async function definirEmailUsuario(userId: string, dados: FormData): Promise<void> {
  await exigirPainel();

  const email = String(dados.get('email') ?? '').trim().toLowerCase();
  if (!email.includes('@') || email.length < 6) throw new Error('Informe um e-mail válido.');
  if (email.endsWith('@sem-email.insted.local')) {
    throw new Error('Este é o endereço provisório do sistema, não um e-mail real.');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, nome: true, email: true },
  });
  if (!user) throw new Error('Usuário não encontrado.');

  const ocupado = await prisma.user.findFirst({
    where: { email, id: { not: userId }, deletadoEm: null },
    select: { nome: true, matricula: true },
  });
  if (ocupado) {
    throw new Error(`Este e-mail já é de ${ocupado.nome} (${ocupado.matricula}).`);
  }

  await prisma.user.update({ where: { id: userId }, data: { email } });
  await prisma.auditLog.create({
    data: {
      acao: 'USUARIO_EMAIL_DEFINIDO',
      entidade: 'User',
      entidadeId: userId,
      dadosAntes: { email: user.email },
      dadosDepois: { email },
    },
  });

  revalidatePath('/cadastros/usuarios');
}
