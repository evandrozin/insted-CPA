'use server';

/**
 * Resolução de docentes ambíguos.
 *
 * O que esta ação decide é QUEM é a pessoa: dos perfis que o JACAD devolve com
 * o mesmo nome, qual é o docente. Por isso exige ADMIN (e não só sessão de
 * painel) e deixa trilha de auditoria.
 *
 * O ponto delicado é onde a escolha é gravada. O cadastro do docente JÁ existe,
 * inativo e com matrícula provisória, e é nele que estão pendurados as alocações
 * (e, com elas, quem avaliou quem) e qualquer resposta já recebida. Então a
 * escolha é gravada NO MESMO cadastro: muda a matrícula para `JACAD-P-<idPerfil>`
 * — a que o importador daria a um docente conciliado — e ativa. O `id` não muda.
 *
 * Fazer diferente (criar um cadastro novo e deixar o antigo) é o caminho que
 * parece óbvio e dobra os cards de professor dos alunos: a próxima importação
 * criaria alocações para o cadastro novo, e as do antigo continuariam ativas.
 *
 * A conciliação passa a MANUAL, que a re-execução do importador não sobrescreve,
 * e `statusManual` protege o status do usuário contra a próxima promoção.
 */
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, prisma } from '@insted/database';
import { normalizarNome } from '@insted/jacad';
import { exigirAdmin } from '@/lib/sessao';
import {
  DOMINIO_PROVISORIO,
  emailProvisorio,
  lerCandidatos,
  matriculaDoPerfil,
} from '@/lib/docentes-ambiguos';

const TELA = '/cadastros/docentes-ambiguos';

export async function resolverDocente(nomeNormalizado: string, dados: FormData): Promise<void> {
  const eu = await exigirAdmin();

  const idPerfil = Number(dados.get('idPerfil'));
  const emailDigitado = String(dados.get('email') ?? '').trim().toLowerCase();
  const semEmail = dados.get('semEmail') === 'on';

  if (!Number.isInteger(idPerfil)) throw new Error('Escolha qual dos perfis é o docente.');

  const conc = await prisma.jacadDocenteConciliacao.findUnique({ where: { nomeNormalizado } });
  if (!conc || conc.status !== 'AMBIGUO') {
    throw new Error('Este nome não está mais pendente — talvez outra pessoa já tenha resolvido.');
  }

  const candidatos = lerCandidatos(conc.candidatos);
  const escolhido = candidatos.find((c) => c.idPerfil === idPerfil);
  if (!escolhido) throw new Error('O perfil escolhido não está entre os candidatos deste nome.');

  // O cadastro do docente no CPA: um só, pelo nome normalizado. Mais de um (ou
  // nenhum) é situação que esta tela não sabe resolver sem adivinhar.
  const professores = await prisma.user.findMany({
    where: { role: 'PROFESSOR', deletadoEm: null },
    select: { id: true, nome: true, matricula: true, email: true, status: true, cpf: true },
  });
  const doNome = professores.filter((p) => normalizarNome(p.nome) === nomeNormalizado);
  if (doNome.length === 0) {
    throw new Error(
      `Não há cadastro de docente para "${conc.nomeOriginal}" no CPA. Rode a importação do JACAD e tente de novo.`,
    );
  }
  if (doNome.length > 1) {
    throw new Error(
      `Há ${doNome.length} cadastros de docente com o nome "${conc.nomeOriginal}". ` +
        'Junte-os em Usuários antes de resolver — escolher um deles aqui seria adivinhar.',
    );
  }
  const docente = doNome[0];

  // ---- e-mail
  const baseEmail = emailDigitado || escolhido.email || '';
  let emailFinal: string;

  if (semEmail) {
    // Caso típico: o docente também é da comissão e o e-mail dele já é de uma
    // conta administrativa — e-mail é único no sistema. Ele entra pelo link do
    // portal, que não usa e-mail.
    emailFinal = emailProvisorio(idPerfil);
  } else {
    if (!baseEmail && escolhido.email === undefined) {
      // Registro anterior à carga dos dados: não sabemos se o perfil tem e-mail,
      // e dizer "não tem" mandaria a pessoa procurar um problema que não existe.
      throw new Error(
        'Os dados deste perfil ainda não foram carregados do JACAD, então o e-mail dele é ' +
          'desconhecido. Informe o e-mail institucional no campo da tela, ou carregue os dados ' +
          'com: npm run homolog -- jacad conciliar-docentes --so-ambiguos',
      );
    }
    if (!baseEmail) {
      throw new Error(
        'Este perfil não tem e-mail no JACAD. Informe o e-mail institucional do docente — ' +
          'ou marque "sem e-mail" se ele só vai entrar pelo link do portal.',
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(baseEmail) || baseEmail.length > 254) {
      throw new Error('Informe um e-mail válido.');
    }
    if (baseEmail.endsWith(`@${DOMINIO_PROVISORIO}`)) {
      throw new Error('Este é o endereço provisório do sistema, não um e-mail real.');
    }

    const dono = await prisma.user.findFirst({
      where: {
        email: { equals: baseEmail, mode: 'insensitive' },
        id: { not: docente.id },
        deletadoEm: null,
      },
      select: { nome: true, matricula: true, role: true },
    });
    if (dono) {
      throw new Error(
        `O e-mail ${baseEmail} já é de ${dono.nome} (${dono.matricula}, ${dono.role.toLowerCase()}). ` +
          'E-mail é único no sistema. Se é a mesma pessoa com conta administrativa, marque ' +
          '"sem e-mail" — ele entra pelo link do portal.',
      );
    }
    emailFinal = baseEmail;
  }

  // ---- matrícula: a que o importador daria, e que o link do portal procura
  const matricula = matriculaDoPerfil(idPerfil);
  const ocupante = await prisma.user.findUnique({
    where: { matricula },
    select: { id: true, nome: true },
  });
  if (ocupante && ocupante.id !== docente.id) {
    throw new Error(
      `A matrícula ${matricula} já é de ${ocupante.nome}. O perfil #${idPerfil} parece já ` +
        'estar ligado a outra pessoa — confira antes de continuar.',
    );
  }

  // ---- CPF: é único no sistema; se já é de outro, não grava em lugar nenhum
  // (a promoção copiaria da conciliação para o usuário e estouraria a restrição).
  const cpf = escolhido.cpf && /^\d{11}$/.test(escolhido.cpf) ? escolhido.cpf : null;
  const cpfDeOutro = cpf
    ? await prisma.user.findFirst({ where: { cpf, id: { not: docente.id } }, select: { id: true } })
    : null;
  const cpfGravado = cpf && !cpfDeOutro ? cpf : null;

  // Quem não foi escolhido perde e-mail, CPF e nascimento: eram necessários só
  // para decidir, e são dado pessoal de quem talvez nem seja do Insted.
  const candidatosDepois: Prisma.InputJsonValue = candidatos.map((c) =>
    c.idPerfil === idPerfil
      ? c
      : { idPerfil: c.idPerfil, nome: c.nome, cargo: c.cargo, temEmail: c.temEmail, status: c.status },
  );

  const quando = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  await prisma.$transaction([
    prisma.user.update({
      where: { id: docente.id },
      data: {
        matricula,
        email: emailFinal,
        ...(cpfGravado ? { cpf: cpfGravado } : {}),
        status: 'ATIVO',
        statusManual: true,
      },
    }),
    prisma.jacadDocenteConciliacao.update({
      where: { nomeNormalizado },
      data: {
        status: 'MANUAL',
        idPerfil,
        // A promoção só trata o docente como resolvido quando há e-mail aqui.
        email: semEmail ? (baseEmail || emailFinal) : emailFinal,
        cpf: cpfGravado,
        candidatos: candidatosDepois,
        observacao: `Escolhido por ${eu.nome} em ${quando}: perfil #${idPerfil}.`,
      },
    }),
    prisma.auditLog.create({
      data: {
        userId: eu.id,
        acao: 'DOCENTE_CONCILIADO_MANUAL',
        entidade: 'User',
        entidadeId: docente.id,
        dadosAntes: { matricula: docente.matricula, status: docente.status },
        dadosDepois: {
          nome: docente.nome,
          matricula,
          idPerfil,
          candidatos: candidatos.map((c) => c.idPerfil),
          semEmail,
          cpfGravado: Boolean(cpfGravado),
        },
      },
    }),
  ]);

  revalidatePath(TELA);
  revalidatePath('/alocacoes/docentes');
  revalidatePath('/cadastros/usuarios');
  redirect(`${TELA}?ok=${encodeURIComponent(docente.nome)}`);
}
