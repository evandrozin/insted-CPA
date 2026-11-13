'use server';

/**
 * Entrada do TÉCNICO-ADMINISTRATIVO, só com o e-mail.
 *
 * Decisão da comissão: o corpo técnico não tem portal como os acadêmicos, e a
 * validação é apenas o e-mail — o que basta para impedir mais de uma resposta
 * por funcionário, porque a tarefa é uma por pessoa e o envio a fecha.
 *
 * ISTO NÃO AUTENTICA NINGUÉM no sentido forte. Quem souber o e-mail de um colega
 * entra no lugar dele e responde antes dele. É o mesmo risco que a CPA já aceita
 * para os alunos (ver `docs/08-autenticacao-jacad.md`), e o que se faz é vigiar a
 * porta:
 *
 * - só entra conta TECNICO_ADMIN ativa. E-mail de ADMIN, GESTOR, professor ou
 *   aluno recebe a MESMA resposta de "não encontrado": um e-mail forjável jamais
 *   abre o painel nem revela quem é quem;
 * - tentativas erradas são limitadas por IP e por e-mail (a própria trilha de
 *   auditoria faz a contagem);
 * - toda entrada e toda recusa viram registro, com IP e user agent.
 *
 * A sessão aberta aqui é a mesma dos demais respondentes e só alcança
 * `/minhas-avaliacoes` e a própria tarefa. Ela nunca entra no caminho da
 * gravação das respostas: o anonimato não depende dela.
 *
 * Erros voltam por redirecionamento, e não por `throw`: em produção o Next troca
 * a mensagem de qualquer erro de ação por um texto genérico, e esta é uma tela
 * de quem não tem a quem perguntar.
 */
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { prisma } from '@insted/database';
import { abrirSessao, garantirSessaoPossivel } from '@/lib/sessao';
import { familiaDeEmails, semEmail } from '@/lib/tecnicos';

/**
 * Estado da tela de entrada. Só preenchido quando o e-mail é de mais de um
 * técnico (caixa de setor): a tela então pergunta quem é a pessoa.
 */
export type EstadoEntrada = {
  n: number;
  /** E-mail digitado, para devolver junto com a escolha. */
  email?: string;
  opcoes?: { id: string; nome: string }[];
};

const TELA = '/entrar/tecnico';
const LIMITE_POR_EMAIL = 5;
const LIMITE_POR_IP = 20;
const JANELA_MIN = 15;

const NAO_ENCONTRADO =
  'Não encontramos este e-mail entre os técnico-administrativos cadastrados. Confira o endereço ou procure a CPA.';

function voltar(erro: string): never {
  redirect(`${TELA}?${new URLSearchParams({ erro })}`);
}

async function ipDaRequisicao(): Promise<string | null> {
  const h = await headers();
  const encaminhado = h.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim().slice(0, 60);
  return h.get('x-real-ip')?.slice(0, 60) ?? null;
}

async function registrar(
  acao: 'TECNICO_LOGIN' | 'TECNICO_LOGIN_RECUSADO',
  dados: { identificador: string; motivo?: string; userId?: string },
): Promise<void> {
  const h = await headers();
  await prisma.auditLog
    .create({
      data: {
        acao,
        entidade: 'User',
        entidadeId: dados.userId ?? null,
        ip: await ipDaRequisicao(),
        userAgent: h.get('user-agent')?.slice(0, 300) ?? null,
        dadosDepois: { identificador: dados.identificador.slice(0, 120), motivo: dados.motivo ?? null },
      },
    })
    .catch(() => {});
}

/** Recusas recentes do mesmo e-mail ou do mesmo IP. */
async function bloqueado(email: string, ip: string | null): Promise<boolean> {
  const desde = new Date(Date.now() - JANELA_MIN * 60_000);
  const [doEmail, doIp] = await Promise.all([
    prisma.auditLog.count({
      where: {
        acao: 'TECNICO_LOGIN_RECUSADO',
        criadoEm: { gte: desde },
        dadosDepois: { path: ['identificador'], equals: email.slice(0, 120) },
      },
    }),
    ip
      ? prisma.auditLog.count({
          where: { acao: 'TECNICO_LOGIN_RECUSADO', criadoEm: { gte: desde }, ip },
        })
      : Promise.resolve(0),
  ]);
  return doEmail >= LIMITE_POR_EMAIL || doIp >= LIMITE_POR_IP;
}

export async function entrarTecnico(anterior: EstadoEntrada, dados: FormData): Promise<EstadoEntrada> {
  try {
    garantirSessaoPossivel();
  } catch {
    voltar('O acesso está indisponível no momento. Avise a CPA.');
  }

  const email = String(dados.get('email') ?? '')
    .trim()
    .toLowerCase();

  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    voltar('Informe o seu e-mail completo, por exemplo nome@insted.edu.br.');
  }

  // E-mail provisório de quem entrou sem e-mail pela planilha: nunca abre acesso.
  if (semEmail(email)) voltar(NAO_ENCONTRADO);

  const ip = await ipDaRequisicao();
  if (await bloqueado(email, ip)) {
    voltar(`Muitas tentativas. Espere ${JANELA_MIN} minutos e tente de novo, ou procure a CPA.`);
  }

  // O e-mail pode ser de mais de um técnico, ou também de um aluno ou docente:
  // cada um é uma conta, guardada com `+tec`, `+tec2`… (ver `familiaDeEmails`).
  // Procura toda a família e fica só com as contas de técnico.
  const familia = familiaDeEmails(email);
  const candidatos = (
    await prisma.user.findMany({
      where: {
        deletadoEm: null,
        OR: familia.map((e) => ({ email: { equals: e, mode: 'insensitive' as const } })),
      },
      select: { id: true, nome: true, role: true, status: true },
    })
  ).filter((u) => u.role === 'TECNICO_ADMIN');

  // Quem não é técnico recebe a mesma resposta de quem não existe.
  if (candidatos.length === 0) {
    await registrar('TECNICO_LOGIN_RECUSADO', { identificador: email, motivo: 'inexistente' });
    voltar(NAO_ENCONTRADO);
  }

  const ativos = candidatos.filter((u) => u.status === 'ATIVO');
  if (ativos.length === 0) {
    await registrar('TECNICO_LOGIN_RECUSADO', {
      identificador: email,
      motivo: 'inativo',
      userId: candidatos[0].id,
    });
    voltar('Seu acesso está inativo. Procure a CPA.');
  }

  // Mais de um técnico com este e-mail: pergunta quem é. O servidor confere de
  // novo, na volta, que a escolha está entre as contas deste e-mail.
  const escolhido = String(dados.get('escolhido') ?? '');
  let user = ativos.length === 1 ? ativos[0] : ativos.find((u) => u.id === escolhido);
  if (!user) {
    return {
      n: anterior.n + 1,
      email,
      opcoes: ativos.map((u) => ({ id: u.id, nome: u.nome })).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
    };
  }

  await prisma.user.update({ where: { id: user.id }, data: { ultimoAcesso: new Date() } });
  await registrar('TECNICO_LOGIN', { identificador: email, userId: user.id });
  await abrirSessao(user.id);

  // Se há uma única avaliação para responder, vai direto a ela: este acesso
  // existe só para isso.
  const pendentes = await prisma.evaluationTask.findMany({
    where: {
      respondentId: user.id,
      status: { notIn: ['CONCLUIDA', 'DISPENSADA'] },
      period: { status: 'ABERTO' },
    },
    select: { id: true },
    take: 2,
  });

  redirect(pendentes.length === 1 ? `/responder/${pendentes[0].id}` : '/minhas-avaliacoes');
}
