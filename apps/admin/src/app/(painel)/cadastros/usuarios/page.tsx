import Link from 'next/link';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { criarUsuarioManual } from '../actions';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400';

const PAPEIS = ['TODOS', 'ALUNO', 'PROFESSOR', 'GESTOR', 'ADMIN'] as const;

export default async function Usuarios({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);
  const papel = typeof sp.papel === 'string' && sp.papel !== 'TODOS' ? sp.papel : null;
  const criado = typeof sp.ok === 'string' ? sp.ok : null;

  const where = {
    deletadoEm: null,
    ...(papel ? { role: papel as 'ALUNO' } : {}),
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: 'insensitive' as const } },
            { matricula: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, usuarios, porPapel] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      skip: pular,
      take: POR_PAGINA,
      select: {
        id: true,
        nome: true,
        matricula: true,
        email: true,
        role: true,
        status: true,
        senhaProvisoria: true,
        criadoManualmente: true,
      },
    }),
    prisma.user.groupBy({ by: ['role'], where: { deletadoEm: null }, _count: true }),
  ]);

  const contagem = new Map(porPapel.map((p) => [p.role, p._count]));
  const semAcesso = (email: string) => email.endsWith('@sem-email.insted.local');

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Usuários"
      descricao="Vêm do JACAD, e quem não tem e-mail real entra inativo. Quem não está nos quadros da Insted — a representação externa na comissão, por exemplo — se cadastra aqui à mão."
      buscaPlaceholder="Buscar por nome, matrícula ou e-mail…"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/usuarios"
      colunas={[
        { titulo: 'Matrícula', estreita: true },
        { titulo: 'Nome' },
        { titulo: 'E-mail' },
        { titulo: 'Perfil', estreita: true },
        { titulo: 'Origem', estreita: true },
        { titulo: 'Situação', estreita: true },
      ]}
      linhas={usuarios.map((u) => [
        <span className="font-mono text-xs text-slate-400">{u.matricula}</span>,
        <span className="font-medium">{u.nome}</span>,
        semAcesso(u.email) ? (
          <span className="text-slate-300">sem e-mail</span>
        ) : (
          <span className="text-slate-500">{u.email}</span>
        ),
        <Etiqueta tom={u.role === 'ALUNO' ? 'neutro' : 'ok'}>{u.role.toLowerCase()}</Etiqueta>,
        u.criadoManualmente ? (
          <Etiqueta tom="alerta">manual</Etiqueta>
        ) : (
          <span className="text-xs text-slate-300">JACAD</span>
        ),
        u.status === 'ATIVO' ? (
          <Etiqueta tom="ok">ativo</Etiqueta>
        ) : (
          <Etiqueta tom="alerta">{u.status.toLowerCase()}</Etiqueta>
        ),
      ])}
    >
      {criado && (
        <p className="mt-6 rounded-xl border border-brand-teal/40 bg-brand-teal/5 px-4 py-3 text-sm text-slate-600">
          Cadastro criado com a matrícula <span className="font-mono text-brand-teal-hover">{criado}</span>.
          No primeiro acesso, a pessoa informa matrícula e e-mail e define a própria senha.
        </p>
      )}

      <details className="mt-6 rounded-2xl border border-brand-navy/10 bg-white px-5 py-4" open={Boolean(criado)}>
        <summary className="cursor-pointer text-sm font-semibold text-brand-teal hover:text-brand-teal-hover">
          Cadastrar alguém que não vem do JACAD
        </summary>

        <p className="mt-3 max-w-2xl text-xs text-slate-500">
          Para quem não está nos quadros da Insted e nunca vai aparecer numa importação. A matrícula
          recebe um prefixo próprio, o que impede que uma reimportação futura sobrescreva o
          cadastro. Para dar acesso ao painel, use{' '}
          <Link href="/cadastros/comissao" className="font-semibold text-brand-teal hover:text-brand-teal-hover">
            Cadastros → Comissão
          </Link>.
        </p>

        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
          <label className={rotulo}>
            Nome completo
            <input name="nome" required minLength={3} className={`${campo} mt-1`} />
          </label>
          <label className={rotulo}>
            E-mail
            <input type="email" name="email" required className={`${campo} mt-1`} />
          </label>
          <label className={rotulo}>
            Matrícula
            <input name="matricula" placeholder="automática" className={`${campo} mt-1 w-36`} />
          </label>
          <label className={rotulo}>
            Perfil
            <select name="papel" defaultValue="PROFESSOR" className={`${campo} mt-1`}>
              <option value="PROFESSOR">Professor</option>
              <option value="ALUNO">Aluno</option>
            </select>
          </label>
          <button
            formAction={criarUsuarioManual}
            className="self-end rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Cadastrar
          </button>
        </form>
      </details>

      <div className="mt-6 flex flex-wrap gap-2">
        {PAPEIS.map((p) => {
          const ativo = (sp.papel ?? 'TODOS') === p;
          const n = p === 'TODOS' ? [...contagem.values()].reduce((a, b) => a + b, 0) : (contagem.get(p as 'ALUNO') ?? 0);
          return (
            <Link
              key={p}
              href={`/cadastros/usuarios?${new URLSearchParams({ papel: p, ...(q ? { q } : {}) })}`}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                ativo
                  ? 'border-brand-teal bg-brand-teal/10 text-brand-teal-hover'
                  : 'border-brand-navy/10 bg-white text-slate-500 hover:border-brand-teal/40'
              }`}
            >
              {p === 'TODOS' ? 'Todos' : p.charAt(0) + p.slice(1).toLowerCase()}{' '}
              <span className="tabular-nums text-slate-400">{n.toLocaleString('pt-BR')}</span>
            </Link>
          );
        })}
      </div>
    </Lista>
  );
}
