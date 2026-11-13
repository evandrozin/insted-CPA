'use server';

/**
 * Importação de técnico-administrativos por planilha, em duas etapas.
 *
 * 1. ANALISAR: lê o arquivo e mostra, linha a linha, o que aconteceria. Nada é
 *    gravado.
 * 2. CONFIRMAR: grava o que a análise liberou. A análise é REFEITA no servidor
 *    com o que chegou do navegador — o que a tela mostrou como "novo" não é
 *    confiado, porque entre a prévia e o clique alguém pode ter cadastrado a
 *    mesma pessoa.
 *
 * A regra que protege quem já existe: NUNCA se converte uma conta de outro papel.
 * `criarConta` promove quem tem o mesmo e-mail ou matrícula, o que é certo para o
 * botão "Cadastrar" e perigoso numa planilha de 300 linhas — o aluno com o mesmo
 * e-mail deixaria de ser aluno e sairia do ciclo que está respondendo.
 *
 * O que NÃO falta é gente. Toda linha com nome entra:
 *
 * - sem e-mail ou com e-mail inválido: entra como técnico
 *   INATIVO, com um e-mail provisório (ver `lib/tecnicos.ts`). A CPA informa o
 *   e-mail depois, na edição do registro, e a conta ativa sozinha;
 * - e-mail que já é de outra conta (aluno, docente, comissão ou outro técnico):
 *   os técnicos são independentes, mas o e-mail é único no banco, então o técnico
 *   entra como conta à parte, com `nome+tec@dominio`, `+tec2`… (ver
 *   `familiaDeEmails`). Quem digita o e-mail normal em `/entrar/tecnico` cai
 *   nela — ou, se são vários técnicos, escolhe quem é;
 * - matrícula já usada por outra pessoa: entra com uma matrícula interna.
 *
 * Reenviar a mesma planilha não duplica: quem já entrou sem e-mail é reconhecido
 * pela matrícula, e se a planilha agora traz o e-mail dele, ele é completado.
 *
 * Não há senha a entregar: o técnico entra só com o e-mail, em
 * `/entrar/tecnico`.
 */
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { hash } from 'bcryptjs';
import { prisma, Prisma, matriculaInterna } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
import { familiaDeEmails, emailSemEmail, semEmail, slugDoNome } from '@/lib/tecnicos';
import {
  LIMITE_BYTES,
  lerPlanilhaTecnicos,
  type LinhaAnalisada,
  type LinhaLida,
} from '@/lib/importar-tecnicos';

export type EstadoImportacao = {
  /** Muda a cada resposta. */
  n: number;
  erro?: string;
  arquivo?: string;
  linhas?: LinhaAnalisada[];
  /** Marcado na análise; vale também na confirmação. */
  reativar?: boolean;
  concluido?: {
    criados: number;
    semEmail: number;
    completados: number;
    reativados: number;
    semMudanca: number;
  };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Existente = {
  id: string;
  nome: string;
  email: string;
  matricula: string;
  role: string;
  status: string;
  deletadoEm: Date | null;
};

/** Decide a situação de cada linha contra o banco. Não grava nada. */
async function analisar(linhas: LinhaLida[]): Promise<LinhaAnalisada[]> {
  const emails = [
    ...new Set(linhas.map((l) => l.email.trim().toLowerCase()).filter((e) => EMAIL.test(e))),
  ];
  // Também os endereços `+tec`, `+tec2`…: é onde moram os técnicos cujo e-mail é
  // de outra conta ou de outro técnico.
  const emailsConsulta = [...new Set(emails.flatMap((e) => familiaDeEmails(e)))];
  const matriculasInformadas = [...new Set(linhas.map((l) => l.matricula).filter(Boolean))];

  const [porEmail, porMatriculaLista] = await Promise.all([
    emails.length
      ? prisma.$queryRaw<Existente[]>(
          Prisma.sql`SELECT id, nome, email, matricula, role::text AS role, status::text AS status, "deletadoEm"
                       FROM users WHERE lower(email) = ANY(${emailsConsulta})`,
        )
      : Promise.resolve([] as Existente[]),
    // As matrículas informadas e todas as internas (`tec-…`): a automática sai do
    // e-mail ou do nome e pode colidir.
    prisma.$queryRaw<Existente[]>(
      Prisma.sql`SELECT id, nome, email, matricula, role::text AS role, status::text AS status, "deletadoEm"
                   FROM users
                  WHERE matricula LIKE 'tec-%'
                     OR matricula = ANY(${matriculasInformadas.length ? matriculasInformadas : ['']})`,
    ),
  ]);

  const existentePorEmail = new Map(porEmail.map((u) => [u.email.toLowerCase(), u]));
  const existentePorMatricula = new Map(porMatriculaLista.map((u) => [u.matricula, u]));
  const reclamadas = new Set<string>();
  const enderecosUsados = new Set<string>();

  /**
   * Primeira matrícula livre a partir da base. Se a candidata já pertence a um
   * técnico sem e-mail, é a mesma pessoa de uma importação anterior.
   */
  const escolherMatricula = (base: string) => {
    for (let i = 1; ; i++) {
      const c = i === 1 ? base.slice(0, 40) : `${base.slice(0, 36)}-${i}`;
      if (reclamadas.has(c)) continue;
      const u = existentePorMatricula.get(c);
      if (!u) {
        reclamadas.add(c);
        return { matricula: c, anterior: null as Existente | null };
      }
      if (u.role === 'TECNICO_ADMIN' && semEmail(u.email)) {
        reclamadas.add(c);
        return { matricula: c, anterior: u };
      }
      // Ocupada por outra pessoa: tenta a seguinte.
    }
  };

  return linhas.map((l): LinhaAnalisada => {
    const nome = l.nome.replace(/\s+/g, ' ').trim();
    const emailBruto = l.email.trim().toLowerCase();
    const base = { ...l, nome, email: emailBruto };

    if (nome.length < 3) {
      return { ...base, situacao: 'erro', motivo: 'Nome vazio ou curto demais.' };
    }

    // O e-mail que não presta vira "sem e-mail", com o motivo dito na prévia.
    let email = emailBruto;
    let motivoSem = '';
    if (!email) {
      motivoSem = 'Sem e-mail na planilha.';
    } else if (!EMAIL.test(email)) {
      motivoSem = `E-mail inválido na planilha (“${emailBruto.slice(0, 40)}”).`;
      email = '';
    }

    // ------------------------------------------------ com e-mail utilizável
    if (email) {
      // Os técnicos são independentes: o mesmo e-mail pode ser de um aluno, de um
      // docente ou de outro técnico, e cada um é uma conta. O primeiro endereço
      // livre da família (`ana@`, `ana+tec@`, `ana+tec2@`…) fica com o novo.
      // Se o endereço já tem um técnico e ele é a MESMA pessoa (mesma matrícula
      // ou, sem matrícula, mesmo nome), é a linha de uma importação anterior.
      const mesmaPessoa = (u: Existente) =>
        l.matricula
          ? u.matricula === l.matricula
          : u.nome.trim().toLowerCase() === nome.toLowerCase();

      let escolhido: string | null = null;
      for (const endereco of familiaDeEmails(email)) {
        if (enderecosUsados.has(endereco)) continue;
        const u = existentePorEmail.get(endereco);

        if (!u) {
          escolhido = endereco;
          break;
        }
        if (u.role === 'TECNICO_ADMIN' && mesmaPessoa(u)) {
          enderecosUsados.add(endereco);
          reclamadas.add(u.matricula);
          return u.status === 'ATIVO' && !u.deletadoEm
            ? { ...base, email: endereco, matricula: u.matricula, situacao: 'ja', motivo: 'Já cadastrado.' }
            : {
                ...base,
                email: endereco,
                matricula: u.matricula,
                situacao: 'inativo',
                motivo: 'Cadastrado, mas inativo.',
              };
        }
        // Endereço de outra pessoa: tenta o seguinte.
      }
      if (!escolhido) {
        return { ...base, situacao: 'erro', motivo: 'Há 10 contas com este e-mail; não dá para criar outra.' };
      }

      enderecosUsados.add(escolhido);
      const dono = existentePorEmail.get(email);
      const pedida = l.matricula || matriculaInterna(escolhido, 'TECNICO_ADMIN');
      const r = escolherMatricula(pedida);
      const trocou = l.matricula && r.matricula !== l.matricula;
      const notas = [
        escolhido !== email && dono
          ? `O e-mail já é de ${
              dono.role === 'TECNICO_ADMIN' ? 'outro técnico' : dono.role.toLowerCase().replace('_', '-')
            }: este técnico é uma conta à parte (${escolhido}) e entra digitando o e-mail normal em /entrar/tecnico.`
          : '',
        trocou ? `Matrícula ${l.matricula} já é de outra pessoa; usei ${r.matricula}.` : '',
      ]
        .filter(Boolean)
        .join(' ');
      return r.anterior
        ? {
            ...base,
            email: escolhido,
            matricula: r.matricula,
            situacao: 'completar',
            motivo: 'Já cadastrado sem e-mail — o e-mail da planilha será colocado.',
          }
        : {
            ...base,
            email: escolhido,
            matricula: r.matricula,
            situacao: 'novo',
            motivo: notas || undefined,
          };
    }

    // ------------------------------------------------------------ sem e-mail
    const pedida = l.matricula || `tec-${slugDoNome(nome)}`;
    const r = escolherMatricula(pedida);
    const trocou = l.matricula && r.matricula !== l.matricula;
    if (r.anterior) {
      return {
        ...base,
        email: '',
        matricula: r.matricula,
        situacao: 'ja',
        motivo: 'Já cadastrado, sem e-mail.',
      };
    }
    return {
      ...base,
      email: '',
      matricula: r.matricula,
      situacao: 'semEmail',
      motivo:
        motivoSem +
        (trocou ? ` Matrícula ${l.matricula} já é de outra pessoa; usei ${r.matricula}.` : ''),
    };
  });
}

export async function importarTecnicos(
  anterior: EstadoImportacao,
  dados: FormData,
): Promise<EstadoImportacao> {
  await exigirPainel();
  const n = anterior.n + 1;
  const etapa = String(dados.get('etapa') ?? 'analisar');
  const reativar = dados.get('reativar') === 'on';

  try {
    if (etapa === 'analisar') {
      const arquivo = dados.get('arquivo');
      if (!(arquivo instanceof File) || arquivo.size === 0) {
        return { n, erro: 'Escolha o arquivo da planilha.' };
      }
      if (arquivo.size > LIMITE_BYTES) {
        return { n, erro: 'Arquivo grande demais (limite de 2 MB).' };
      }
      const linhas = await lerPlanilhaTecnicos(new Uint8Array(await arquivo.arrayBuffer()));
      return { n, arquivo: arquivo.name, linhas: await analisar(linhas), reativar };
    }

    // ---- confirmar: refaz a análise com o que veio da tela ----
    let enviadas: LinhaLida[];
    try {
      const bruto = JSON.parse(String(dados.get('linhas') ?? '[]')) as LinhaLida[];
      enviadas = bruto.slice(0, 1000).map((l) => ({
        linha: Number(l.linha) || 0,
        nome: String(l.nome ?? ''),
        email: String(l.email ?? ''),
        matricula: String(l.matricula ?? ''),
      }));
    } catch {
      return { n, erro: 'Não consegui ler a prévia. Envie o arquivo de novo.' };
    }

    const analisadas = await analisar(enviadas);
    const quais = (s: LinhaAnalisada['situacao']) => analisadas.filter((l) => l.situacao === s);
    const novas = quais('novo');
    const semMail = quais('semEmail');
    const completar = quais('completar');
    const inativas = quais('inativo');

    // Senha que ninguém conhece: o acesso é pelo e-mail. Um hash para todos
    // basta, e evita centenas de bcrypts na mesma requisição.
    const senhaHash = await hash(randomBytes(24).toString('hex'), 10);

    const dadosBase = {
      role: 'TECNICO_ADMIN' as const,
      senhaHash,
      senhaProvisoria: true,
      criadoManualmente: true,
    };

    const criados = novas.length
      ? await prisma.user.createMany({
          data: novas.map((l) => ({
            ...dadosBase,
            nome: l.nome,
            email: l.email,
            matricula: l.matricula.slice(0, 40),
            status: 'ATIVO' as const,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

    // Inativos de propósito: sem e-mail não há como entrar nem responder, e uma
    // tarefa gerada para quem não consegue abri-la só estragaria a adesão. A edição
    // do registro os ativa quando o e-mail é informado.
    const criadosSemEmail = semMail.length
      ? await prisma.user.createMany({
          data: semMail.map((l) => ({
            ...dadosBase,
            nome: l.nome,
            email: emailSemEmail(l.matricula),
            matricula: l.matricula.slice(0, 40),
            status: 'INATIVO' as const,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

    let completados = 0;
    for (const l of completar) {
      const r = await prisma.user.updateMany({
        where: { matricula: l.matricula, role: 'TECNICO_ADMIN', email: { endsWith: '@sem-email.invalid' } },
        data: { email: l.email, status: 'ATIVO', deletadoEm: null },
      });
      completados += r.count;
    }

    const reativados =
      reativar && inativas.length
        ? await prisma.user.updateMany({
            where: {
              role: 'TECNICO_ADMIN',
              email: { in: inativas.map((l) => l.email), mode: 'insensitive' },
            },
            data: { status: 'ATIVO', deletadoEm: null },
          })
        : { count: 0 };

    await prisma.auditLog.create({
      data: {
        acao: 'TECNICOS_IMPORTADOS',
        entidade: 'User',
        dadosDepois: {
          linhas: analisadas.length,
          criados: criados.count,
          semEmail: criadosSemEmail.count,
          completados,
          reativados: reativados.count,
          erros: quais('erro').length,
        },
      },
    });

    revalidatePath('/cadastros/tecnicos');
    const feitos = criados.count + criadosSemEmail.count + completados + reativados.count;
    return {
      n,
      concluido: {
        criados: criados.count,
        semEmail: criadosSemEmail.count,
        completados,
        reativados: reativados.count,
        semMudanca: analisadas.length - feitos,
      },
    };
  } catch (e) {
    return { n, erro: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
