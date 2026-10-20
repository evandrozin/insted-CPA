/**
 * Entrada pelo link do portal do PROFESSOR do JACAD.
 *
 *   /entrar/portal-docente?idperfil=MTIzNDU=
 *   /entrar/portal-docente?idperfil=MTIzNDU=&email=ZnVsYW5vQGluc3RlZC5lZHUuYnI=
 *
 * Irmã de `/entrar/portal`, que atende os alunos e NÃO é tocada por esta
 * rota: lá o portal manda `<ra>`; aqui o portal do professor manda
 * `<id_perfil>`, que é a chave que o CPA já guarda (matrícula `JACAD-P-<id>`).
 * Rota separada porque a chave, o papel aceito e a trilha de auditoria são
 * outros — e porque mexer na porta dos alunos com uma avaliação em curso seria
 * arriscar quem já está respondendo.
 *
 * ISTO NÃO AUTENTICA NINGUÉM. O parâmetro é texto ou Base 64, e qualquer um o
 * forja. É o mesmo risco aceito pela CPA para os alunos (ver
 * docs/08-autenticacao-jacad.md). O que se faz é vigiar a porta:
 *
 * - toda entrada vira `PORTAL_DOCENTE_LOGIN`, com IP e user agent;
 * - só entra quem é PROFESSOR; ADMIN/GESTOR e demais papéis são recusados e
 *   registrados — um parâmetro forjável jamais abre o painel da CPA;
 * - `email`, quando enviado, é um segundo fator: precisa ser o do cadastro
 *   encontrado. Divergência é recusada, não "perdoada";
 * - CPF NÃO é aceito: passaria na URL e em log de proxy.
 *
 * `email` sozinho (sem `idperfil`) também localiza o docente. Existe como saída
 * caso o `<id_perfil>` do portal se revele diferente do `idPerfil` da API.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import { abrirSessao } from '@/lib/sessao';
import {
  emailsDe,
  idsDePerfil,
  mascararEmail,
  matriculaDoDocente,
} from '@/lib/portal-docente';

export const dynamic = 'force-dynamic';

function recusar(req: NextRequest, motivo: string) {
  const url = new URL('/entrar', req.url);
  url.searchParams.set('erro', motivo);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const brutoId = sp.get('idperfil') ?? sp.get('id_perfil');
  const brutoEmail = sp.get('email');

  // "Se nulo: Não enviar" — docente sem o dado chega sem o parâmetro.
  if (!brutoId && !brutoEmail) {
    return recusar(
      req,
      'O link do portal veio sem a identificação. Entre com sua matrícula e senha.',
    );
  }

  const ids = brutoId ? idsDePerfil(brutoId) : [];
  const emails = brutoEmail ? emailsDe(brutoEmail) : [];

  if (ids.length === 0 && emails.length === 0) {
    await registrarFalha(req, 'ilegivel', brutoId, brutoEmail, null);
    return recusar(req, 'O link do portal veio com uma identificação ilegível. Avise a CPA.');
  }

  const achados = await prisma.user.findMany({
    where:
      ids.length > 0
        ? { matricula: { in: ids.map(matriculaDoDocente) }, deletadoEm: null }
        : {
            deletadoEm: null,
            OR: emails.map((e) => ({ email: { equals: e, mode: 'insensitive' as const } })),
          },
    select: { id: true, matricula: true, email: true, status: true, role: true },
  });

  // Duas leituras apontando para pessoas diferentes: escolher uma no chute
  // abriria sessão na conta errada.
  if (achados.length > 1) {
    await registrarFalha(req, 'ambiguo', brutoId, brutoEmail, achados.map((a) => a.matricula).join(' | '));
    return recusar(req, 'O link do portal é ambíguo. Avise a CPA.');
  }

  const usuario = achados[0];

  if (!usuario) {
    // Sem isto, "não foi importado" é indistinguível de "a tag do portal não é
    // o idPerfil que esperávamos" — e o segundo caso é o que se quer descobrir
    // no primeiro teste: o valor recebido fica na trilha.
    await registrarFalha(req, 'nao encontrado', brutoId, brutoEmail, ids.map(matriculaDoDocente).join(' | ') || null);
    return recusar(req, 'Seu cadastro de docente ainda não foi importado. Avise a CPA.');
  }

  if (usuario.role !== 'PROFESSOR') {
    await prisma.auditLog
      .create({
        data: {
          acao: 'PORTAL_DOCENTE_LOGIN_RECUSADO',
          entidade: 'User',
          entidadeId: usuario.id,
          ip: ipDe(req),
          dadosDepois: { motivo: 'papel nao docente', papel: usuario.role },
        },
      })
      .catch(() => {});
    return recusar(
      req,
      usuario.role === 'ADMIN' || usuario.role === 'GESTOR'
        ? 'Contas administrativas entram pela tela de login, com senha.'
        : 'Esta entrada é só para docentes. Entre com sua matrícula e senha.',
    );
  }

  // Segundo fator: se o portal mandou e-mail, ele tem de ser o do cadastro.
  if (ids.length > 0 && emails.length > 0 && !emails.includes(usuario.email.toLowerCase())) {
    await registrarFalha(req, 'email divergente', brutoId, brutoEmail, usuario.matricula);
    return recusar(req, 'Os dados do portal não conferem com o seu cadastro. Avise a CPA.');
  }

  if (usuario.status !== 'ATIVO') {
    return recusar(req, 'Seu acesso está inativo. Procure a CPA.');
  }

  await prisma.user.update({ where: { id: usuario.id }, data: { ultimoAcesso: new Date() } });

  await prisma.auditLog
    .create({
      data: {
        acao: 'PORTAL_DOCENTE_LOGIN',
        entidade: 'User',
        entidadeId: usuario.id,
        ip: ipDe(req),
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
    })
    .catch(() => {});

  await abrirSessao(usuario.id);

  // Redirecionar tira o parâmetro codificado da barra de endereços.
  return NextResponse.redirect(new URL('/minhas-avaliacoes', req.url));
}

/**
 * Registra uma entrada recusada com o que chegou.
 *
 * O `idperfil` não é segredo e sem ele não há como descobrir por que um docente
 * legítimo foi barrado. O e-mail, sim, é dado pessoal: só vai mascarado.
 */
async function registrarFalha(
  req: NextRequest,
  motivo: string,
  idRecebido: string | null,
  emailRecebido: string | null,
  extraido: string | null,
): Promise<void> {
  const email = emailRecebido ? (emailsDe(emailRecebido)[0] ?? null) : null;
  await prisma.auditLog
    .create({
      data: {
        acao: 'PORTAL_DOCENTE_LOGIN_FALHOU',
        entidade: 'Auth',
        ip: ipDe(req),
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        dadosDepois: {
          motivo,
          idperfil: idRecebido?.slice(0, 60) ?? null,
          email: email ? mascararEmail(email) : emailRecebido ? 'ilegível' : null,
          extraido,
        },
      },
    })
    .catch(() => {});
}

/** IP real por trás do proxy, quando houver. */
function ipDe(req: NextRequest): string | null {
  const encaminhado = req.headers.get('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim().slice(0, 60);
  return req.headers.get('x-real-ip')?.slice(0, 60) ?? null;
}
