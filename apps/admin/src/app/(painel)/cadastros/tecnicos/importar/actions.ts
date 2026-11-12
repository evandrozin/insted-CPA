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
 * Diferente do cadastro individual, aqui NUNCA se converte uma conta que já
 * existe com outro papel. `criarConta` promove quem tem o mesmo e-mail ou
 * matrícula, o que é certo para o botão "Cadastrar" (a pessoa digitou aquele
 * e-mail de propósito) e perigoso numa planilha de 300 linhas: uma linha com o
 * e-mail de um administrador o tornaria técnico e tiraria dele o painel. Quem
 * já é outra coisa aparece como "conflito" e fica como está.
 *
 * Não há senha a entregar: o técnico entra só com o e-mail, em
 * `/entrar/tecnico`. A conta nasce com uma senha aleatória que ninguém conhece
 * (e que "Nova senha" substitui, se alguém precisar dela).
 */
import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { hash } from 'bcryptjs';
import { prisma, Prisma, matriculaInterna } from '@insted/database';
import { exigirPainel } from '@/lib/sessao';
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
  concluido?: { criados: number; reativados: number; semMudanca: number };
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Decide a situação de cada linha contra o banco. Não grava nada. */
async function analisar(linhas: LinhaLida[]): Promise<LinhaAnalisada[]> {
  const emails = [
    ...new Set(linhas.map((l) => l.email.toLowerCase()).filter((e) => EMAIL.test(e))),
  ];
  const matriculasInformadas = [...new Set(linhas.map((l) => l.matricula).filter(Boolean))];

  const [porEmail, porMatricula, internas] = await Promise.all([
    emails.length
      ? prisma.$queryRaw<
          { id: string; email: string; role: string; status: string; deletadoEm: Date | null }[]
        >(
          Prisma.sql`SELECT id, email, role::text AS role, status::text AS status, "deletadoEm"
                       FROM users WHERE lower(email) = ANY(${emails})`,
        )
      : [],
    matriculasInformadas.length
      ? prisma.user.findMany({
          where: { matricula: { in: matriculasInformadas } },
          select: { email: true, matricula: true },
        })
      : [],
    // Todas as matrículas internas já usadas: a automática sai do e-mail e pode
    // colidir entre domínios diferentes (ana@a.com, ana@b.com).
    prisma.user.findMany({
      where: { matricula: { startsWith: 'tec-' } },
      select: { matricula: true },
    }),
  ]);

  const existente = new Map(porEmail.map((u) => [u.email.toLowerCase(), u]));
  const matriculaDe = new Map(porMatricula.map((u) => [u.matricula, u.email.toLowerCase()]));
  const usadas = new Set(internas.map((u) => u.matricula));

  const vistoEmail = new Map<string, number>();
  const vistaMatricula = new Map<string, number>();

  return linhas.map((l): LinhaAnalisada => {
    const email = l.email.trim().toLowerCase();
    const base = { ...l, email };

    if (l.nome.trim().length < 3) {
      return { ...base, situacao: 'erro', motivo: 'Nome vazio ou curto demais.' };
    }
    if (!EMAIL.test(email)) {
      return {
        ...base,
        situacao: 'erro',
        motivo: email ? 'E-mail inválido.' : 'Sem e-mail — é ele que dá acesso.',
      };
    }
    const repetido = vistoEmail.get(email);
    if (repetido) {
      return { ...base, situacao: 'erro', motivo: `E-mail repetido (já na linha ${repetido}).` };
    }
    vistoEmail.set(email, l.linha);

    const u = existente.get(email);
    if (u) {
      if (u.role !== 'TECNICO_ADMIN') {
        return {
          ...base,
          situacao: 'conflito',
          motivo: `Já existe como ${u.role.toLowerCase().replace('_', '-')}. Não foi alterado.`,
        };
      }
      return u.status === 'ATIVO' && !u.deletadoEm
        ? { ...base, situacao: 'ja', motivo: 'Já cadastrado.' }
        : { ...base, situacao: 'inativo', motivo: 'Cadastrado, mas inativo.' };
    }

    // Pessoa nova: define a matrícula.
    if (l.matricula) {
      const dono = matriculaDe.get(l.matricula);
      if (dono && dono !== email) {
        return { ...base, situacao: 'erro', motivo: `Matrícula já usada por outra pessoa (${dono}).` };
      }
      const outra = vistaMatricula.get(l.matricula);
      if (outra) {
        return { ...base, situacao: 'erro', motivo: `Matrícula repetida (já na linha ${outra}).` };
      }
      vistaMatricula.set(l.matricula, l.linha);
      return { ...base, situacao: 'novo' };
    }

    let m = matriculaInterna(email, 'TECNICO_ADMIN');
    for (let i = 2; usadas.has(m); i++) m = `${matriculaInterna(email, 'TECNICO_ADMIN').slice(0, 36)}-${i}`;
    usadas.add(m);
    return { ...base, matricula: m, situacao: 'novo' };
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
    const novas = analisadas.filter((l) => l.situacao === 'novo');
    const inativas = analisadas.filter((l) => l.situacao === 'inativo');

    // Senha que ninguém conhece: o acesso é pelo e-mail. Um hash para todos
    // basta, e evita 300 bcrypts na mesma requisição.
    const senhaHash = await hash(randomBytes(24).toString('hex'), 10);

    const criados = novas.length
      ? await prisma.user.createMany({
          data: novas.map((l) => ({
            nome: l.nome.trim(),
            email: l.email,
            matricula: l.matricula.slice(0, 40),
            role: 'TECNICO_ADMIN' as const,
            status: 'ATIVO' as const,
            senhaHash,
            senhaProvisoria: true,
            criadoManualmente: true,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

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
          reativados: reativados.count,
          conflitos: analisadas.filter((l) => l.situacao === 'conflito').length,
          erros: analisadas.filter((l) => l.situacao === 'erro').length,
        },
      },
    });

    revalidatePath('/cadastros/tecnicos');
    return {
      n,
      concluido: {
        criados: criados.count,
        reativados: reativados.count,
        semMudanca: analisadas.length - criados.count - reativados.count,
      },
    };
  } catch (e) {
    return { n, erro: e instanceof Error ? e.message : 'Erro inesperado.' };
  }
}
