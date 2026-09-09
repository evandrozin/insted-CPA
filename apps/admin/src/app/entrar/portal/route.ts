/**
 * Entrada pelo link do portal do JACAD.
 *
 *   /entrar/portal?ra=MjAyMzEwNDEyOQ==
 *
 * O portal do aluno (e o do professor) permite cadastrar "Links Alternativos"
 * com parâmetros montados a partir de tags — `<ra>`, `<email>`, `<nome>`, `<cpf>`
 * e outras. É o único ponto de integração disponível na tela, e ele **não emite
 * token**: a única transformação oferecida é Base 64, que é codificação, não
 * criptografia.
 *
 * ISTO NÃO AUTENTICA NINGUÉM. Quem souber o RA de um colega decodifica o
 * parâmetro, troca o valor, recodifica e entra no lugar dele — e a resposta
 * gravada não carrega nenhum indício disso, porque o anonimato é justamente o
 * que impede ligar resposta a pessoa. A decisão de aceitar esse risco foi
 * tomada com ele explícito (ver docs/08-autenticacao-jacad.md).
 *
 * Como a porta não pode ser trancada, ela é ao menos vigiada: toda entrada
 * vira `PORTAL_LOGIN` na auditoria, com IP e user agent. Não previne o abuso;
 * torna-o visível depois — e o padrão de um abuso em escala (dezenas de RAs
 * diferentes do mesmo IP em minutos) é bem distinto do uso normal.
 *
 * O caminho correto continua sendo `/entrar/jacad`, que valida um accessToken
 * contra a API e já funciona. Falta a Jacad oferecer uma tag de token nesta
 * tela; enquanto não oferecer, é aqui que o aluno entra.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@insted/database';
import { abrirSessao } from '@/lib/sessao';

export const dynamic = 'force-dynamic';

/** Papéis que NÃO podem entrar por esta porta. */
const ADMINISTRATIVOS = new Set(['ADMIN', 'GESTOR']);

/** Formato de matrícula do Insted: dígitos, com um caso legado usando hífen. */
const RA_PLAUSIVEL = /^[A-Za-z0-9][A-Za-z0-9.\-/]{2,29}$/;

function recusar(req: NextRequest, motivo: string) {
  const url = new URL('/entrar', req.url);
  url.searchParams.set('erro', motivo);
  return NextResponse.redirect(url);
}

/**
 * Leituras possíveis do parâmetro: o texto como veio e, se decodificar, o
 * Base 64 dele.
 *
 * Não dá para escolher entre as duas olhando só o formato — foi a tentativa
 * anterior e ela falhava de um jeito traiçoeiro. `Mi0yMDE4` é o Base 64 de
 * `2-2018`, mas também parece um RA legítimo: letras e dígitos, nada que
 * denuncie. Testando "parece RA puro?" primeiro, esse caso nunca chegava a ser
 * decodificado.
 *
 * Pior: o erro só aparecia em alguns alunos. Base 64 de texto com tamanho
 * múltiplo de 3 sai sem o `=` final, e era justamente o `=` que reprovava no
 * formato e mandava decodificar. Quem tinha RA de 10 caracteres entrava; quem
 * tinha 6, não.
 *
 * Então nenhuma das duas leituras é descartada aqui. Quem desempata é o banco.
 *
 * A troca de `+` por espaço não é preciosismo: `+` é caractere válido do
 * alfabeto Base 64 e o parser de query string o converte em espaço.
 */
function candidatosDeRa(valor: string): string[] {
  const bruto = valor.trim();
  if (!bruto) return [];

  const candidatos = new Set<string>();
  const aceitar = (v: string) => {
    const c = v.trim();
    if (RA_PLAUSIVEL.test(c) && /\d/.test(c)) candidatos.add(c);
  };

  aceitar(bruto);
  try {
    // Base 64 aceita quase tudo sem lançar; quem valida é o formato do RA.
    aceitar(Buffer.from(bruto.replace(/ /g, '+'), 'base64').toString('utf8'));
  } catch {
    /* segue com o que houver */
  }

  return [...candidatos];
}

export async function GET(req: NextRequest) {
  const parametro =
    req.nextUrl.searchParams.get('ra') ?? req.nextUrl.searchParams.get('matricula');

  // O JACAD tem a opção "Se nulo: Não enviar": aluno sem o dado chega sem o
  // parâmetro, e não é erro dele.
  if (!parametro) {
    return recusar(req, 'O link do portal veio sem a matrícula. Entre com sua matrícula e senha.');
  }

  const candidatos = candidatosDeRa(parametro);
  if (candidatos.length === 0) {
    await registrarFalha(req, 'ilegivel', parametro, null);
    return recusar(req, 'O link do portal veio com uma matrícula ilegível. Avise a CPA.');
  }

  const achados = await prisma.user.findMany({
    where: { matricula: { in: candidatos }, deletadoEm: null },
    select: { id: true, matricula: true, status: true, role: true },
  });

  // Duas leituras apontando para pessoas diferentes é improvável (RA é
  // numérico, Base 64 é alfanumérico misto), mas escolher uma no chute seria
  // abrir sessão na conta errada. Recusa e registra.
  if (achados.length > 1) {
    await registrarFalha(req, 'ambiguo', parametro, achados.map((a) => a.matricula).join(' | '));
    return recusar(req, 'O link do portal é ambíguo. Avise a CPA.');
  }

  const usuario = achados[0];
  const ra = usuario?.matricula ?? candidatos[0];

  if (!usuario) {
    // Sem isto, "não foi importado" é indistinguível de "o portal mandou o
    // dado num formato que não esperávamos" — e o segundo caso é o provável,
    // já que o RA vem de uma tag cujo conteúdo exato não está documentado.
    await registrarFalha(req, 'nao encontrado', parametro, ra);
    return recusar(req, 'Seu cadastro ainda não foi importado para a avaliação. Avise a CPA.');
  }

  // Um parâmetro que qualquer um forja não pode abrir o painel da CPA. Aqui
  // entra quem responde; quem administra entra por senha.
  if (ADMINISTRATIVOS.has(usuario.role)) {
    await prisma.auditLog
      .create({
        data: {
          acao: 'PORTAL_LOGIN_RECUSADO',
          entidade: 'User',
          entidadeId: usuario.id,
          dadosDepois: { motivo: 'papel administrativo', ip: ipDe(req) },
        },
      })
      .catch(() => {});
    return recusar(req, 'Contas administrativas entram pela tela de login, com senha.');
  }

  if (usuario.status !== 'ATIVO') {
    return recusar(req, 'Seu acesso está inativo. Procure a secretaria.');
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { ultimoAcesso: new Date() },
  });

  // O IP e o user agent são o que resta de rastro quando a credencial não
  // prova nada. Sem eles, um abuso em escala seria indistinguível do uso real.
  await prisma.auditLog
    .create({
      data: {
        acao: 'PORTAL_LOGIN',
        entidade: 'User',
        entidadeId: usuario.id,
        ip: ipDe(req),
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      },
    })
    .catch(() => {});

  await abrirSessao(usuario.id);

  // Redirecionar tira o RA codificado da barra de endereços — ele não fica no
  // histórico da página seguinte nem vaza por `Referer`.
  return NextResponse.redirect(new URL('/minhas-avaliacoes', req.url));
}

/**
 * Registra uma entrada recusada com o valor que chegou.
 *
 * O RA não é segredo — circula em lista de chamada — e sem ele não há como
 * descobrir por que um aluno legítimo foi barrado. Guarda o parâmetro cru e o
 * que se conseguiu extrair dele, truncados.
 */
async function registrarFalha(
  req: NextRequest,
  motivo: string,
  recebido: string,
  extraido: string | null,
): Promise<void> {
  await prisma.auditLog
    .create({
      data: {
        acao: 'PORTAL_LOGIN_FALHOU',
        entidade: 'Auth',
        ip: ipDe(req),
        userAgent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
        dadosDepois: { motivo, recebido: recebido.slice(0, 120), extraido },
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
