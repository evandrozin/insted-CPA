/**
 * Retorno do SSO do JACAD.
 *
 * O aluno se autentica no portal do JACAD (com a senha que ele já tem), o
 * portal o envia para cá com um token de acesso, e esta rota valida o token
 * contra a API para descobrir quem é. Se confere, abre a sessão do CPA — sem
 * senha nova.
 *
 *   /entrar/jacad?accessToken=<uuid>
 *
 * A direção importa: quem inicia é o PORTAL, não o CPA. O caminho inverso
 * (o CPA chamar `login/aluno` a partir de um RA digitado) autenticaria
 * qualquer um que soubesse o RA de outro — e RA não é segredo, circula em
 * lista de chamada e trabalho em grupo.
 *
 * Depende da permissão `service.api.integracao.auth.access.token.obter.dados`
 * no token de integração. Sem ela o JACAD responde 403 e esta rota explica
 * isso em vez de falhar em silêncio.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import { clienteDoAmbiente, validarAccessToken } from '@insted/jacad';
import { abrirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/** Manda de volta ao login com uma explicação legível. */
function recusar(req: NextRequest, motivo: string) {
  const url = new URL('/entrar', req.url);
  url.searchParams.set('erro', motivo);
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const accessToken = req.nextUrl.searchParams.get('accessToken');
  if (!accessToken) return recusar(req, 'Link de acesso sem token.');

  let resultado;
  try {
    resultado = await validarAccessToken(clienteDoAmbiente(), accessToken);
  } catch {
    return recusar(req, 'Não foi possível falar com o JACAD agora. Tente de novo em instantes.');
  }

  if (!resultado.ok) {
    // 403 é configuração pendente, não culpa do aluno — registra para a CPA ver.
    if (resultado.status === 403) {
      await prisma.auditLog
        .create({
          data: {
            acao: 'SSO_PERMISSAO_AUSENTE',
            entidade: 'Auth',
            dadosDepois: { mensagem: resultado.mensagem },
          },
        })
        .catch(() => {});
      return recusar(req, 'A entrada pelo portal ainda não está habilitada. Use sua senha do CPA.');
    }
    return recusar(req, 'Link de acesso expirado ou inválido. Entre pelo portal de novo.');
  }

  // O JACAD devolve o cadastro INTEIRO do aluno — 122 campos, incluindo CPF,
  // RG, filiação, religião e necessidade especial. Nada disso é necessário
  // para abrir uma sessão, e guardar o que não se precisa é a forma mais fácil
  // de transformar um login num incidente de dados.
  //
  // Extraímos apenas os dois campos que identificam quem é, e o resto morre
  // aqui: não é persistido, não é logado, não sai desta função.
  const d = (resultado.dados ?? {}) as Record<string, unknown>;
  const ra = String(d.ra ?? d.registroAcademico ?? d.matricula ?? '').trim();
  const email = String(d.email ?? d.alunoEmail ?? '').trim().toLowerCase();

  if (!ra && !email) {
    await prisma.auditLog
      .create({
        data: {
          acao: 'SSO_RETORNO_INESPERADO',
          entidade: 'Auth',
          // Só os nomes dos campos de identificação que procuramos, nunca os
          // valores nem a lista inteira — o retorno tem 122 campos pessoais.
          dadosDepois: {
            procurados: ['ra', 'registroAcademico', 'matricula', 'email'],
            presentes: ['ra', 'registroAcademico', 'matricula', 'email'].filter((k) => k in d),
          },
        },
      })
      .catch(() => {});
    return recusar(req, 'O JACAD não informou quem é o usuário. Avise a CPA.');
  }

  const usuario = await prisma.user.findFirst({
    where: {
      deletadoEm: null,
      OR: [...(ra ? [{ matricula: ra }] : []), ...(email ? [{ email }] : [])],
    },
    select: { id: true, status: true, role: true },
  });

  if (!usuario) {
    return recusar(req, 'Seu cadastro ainda não foi importado para a avaliação. Avise a CPA.');
  }
  if (usuario.status !== 'ATIVO') {
    return recusar(req, 'Seu acesso está inativo. Procure a secretaria.');
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { ultimoAcesso: new Date() },
  });
  await prisma.auditLog.create({
    data: { acao: 'SSO_LOGIN', entidade: 'User', entidadeId: usuario.id },
  });

  await abrirSessao(usuario.id);
  return NextResponse.redirect(new URL('/minhas-avaliacoes', req.url));
}
