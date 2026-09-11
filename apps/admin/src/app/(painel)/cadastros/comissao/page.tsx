/**
 * Comissão — quem administra a avaliação.
 *
 * Membro da comissão não é aluno nem professor: normalmente não existe no
 * JACAD, e a conta dele não tem vínculo com matrícula, turma ou disciplina.
 * Por isso esta tela é separada de Usuários, que lista o que veio da
 * importação.
 */
import { prisma, PAPEIS_PAINEL } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { exigirAdmin } from '@/lib/sessao';
import { adicionarMembro, gerarNovaSenha, removerMembro } from './actions';
import { FormComSenha } from '@/components/FormComSenha';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400';

const AVISOS: Record<string, string> = {
  criado: 'Conta criada.',
  promovido: 'Cadastro que já existia foi promovido — a pessoa mantém o histórico dela.',
  senha: 'Nova senha provisória gerada.',
  'revogado-respondente': 'Acesso ao painel revogado. A pessoa continua como respondente.',
  'revogado-desativado': 'Acesso revogado e cadastro desativado.',
};

export default async function Comissao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const eu = await exigirAdmin();
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);

  const aviso = typeof sp.ok === 'string' ? AVISOS[sp.ok] : null;

  const where = {
    deletadoEm: null,
    role: { in: [...PAPEIS_PAINEL] },
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, membros] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ role: 'asc' }, { nome: 'asc' }],
      skip: pular,
      take: POR_PAGINA,
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        status: true,
        senhaProvisoria: true,
        ultimoAcesso: true,
      },
    }),
  ]);

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Comissão"
      descricao="Quem administra a avaliação. São contas próprias, sem vínculo com matrícula, turma ou disciplina — e não recebem questionário para responder."
      buscaPlaceholder="Buscar por nome ou e-mail…"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/comissao"
      colunas={[
        { titulo: 'Nome' },
        { titulo: 'E-mail de acesso' },
        { titulo: 'Papel', estreita: true },
        { titulo: 'Situação', estreita: true },
        { titulo: 'Último acesso', estreita: true },
        { titulo: '', estreita: true },
      ]}
      linhas={membros.map((m) => [
        <span className="font-medium">
          {m.nome}
          {m.id === eu.id && <span className="ml-2 text-[11px] text-slate-400">você</span>}
        </span>,
        <span className="font-mono text-xs text-slate-500">{m.email}</span>,
        <Etiqueta tom={m.role === 'ADMIN' ? 'ok' : 'neutro'}>
          {m.role === 'ADMIN' ? 'administrador' : 'gestor'}
        </Etiqueta>,
        m.status !== 'ATIVO' ? (
          <Etiqueta tom="alerta">{m.status.toLowerCase()}</Etiqueta>
        ) : m.senhaProvisoria ? (
          <Etiqueta tom="alerta">senha provisória</Etiqueta>
        ) : (
          <Etiqueta tom="ok">ativo</Etiqueta>
        ),
        <span className="text-xs text-slate-400">
          {m.ultimoAcesso ? m.ultimoAcesso.toLocaleDateString('pt-BR') : 'nunca entrou'}
        </span>,
        <div className="flex gap-1.5">
          <FormComSenha acao={gerarNovaSenha}>
            <input type="hidden" name="userId" value={m.id} />
            <button
              type="submit"
              className="rounded-lg border border-brand-navy/10 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
              title="Gera uma nova senha provisória e mostra na tela — a anterior deixa de valer"
            >
              Nova senha
            </button>
          </FormComSenha>
          {m.id !== eu.id && (
            <form>
              <button
                formAction={removerMembro.bind(null, m.id)}
                className="rounded-lg border border-brand-orange/30 px-2.5 py-1 text-[11px] font-semibold text-brand-orange transition-colors hover:bg-brand-orange/10"
                title="Tira o acesso ao painel"
              >
                Revogar
              </button>
            </form>
          )}
        </div>,
      ])}
      vazio={
        <p className="text-sm text-slate-400">
          Nenhuma conta além da sua. Use o formulário acima para cadastrar os demais membros.
        </p>
      }
    >
      {aviso && (
        <p className="mt-6 rounded-xl border border-brand-navy/10 bg-white px-4 py-3 text-sm text-slate-600">
          {aviso}
        </p>
      )}

      {/* ---------------------------------------- novo membro */}
      <FormComSenha
        acao={adicionarMembro}
        className="mt-6 rounded-2xl border border-brand-navy/10 bg-white px-5 py-5"
      >
        <p className="font-brand text-sm font-bold text-brand-navy">Adicionar membro</p>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          Se a pessoa já existir no sistema — um docente importado do JACAD, por exemplo — o
          cadastro dela é promovido em vez de duplicado, e o histórico é preservado.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
          <label className={rotulo}>
            Nome completo
            <input name="nome" required minLength={3} className={`${campo} mt-1`} />
          </label>
          <label className={rotulo}>
            E-mail institucional
            <input type="email" name="email" required className={`${campo} mt-1`} />
          </label>
          <label className={rotulo}>
            Papel
            <select name="papel" defaultValue="ADMIN" className={`${campo} mt-1`}>
              <option value="ADMIN">Administrador</option>
              <option value="GESTOR">Gestor</option>
            </select>
          </label>
          <button
            type="submit"
            className="self-end rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Criar conta
          </button>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          Administrador faz tudo, inclusive gerenciar estas contas. Gestor usa o painel mas não
          mexe aqui — e passa a ver só o próprio escopo quando os relatórios entrarem.
        </p>
      </FormComSenha>
    </Lista>
  );
}
