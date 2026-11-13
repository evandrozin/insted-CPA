/**
 * Corpo técnico-administrativo — secretaria, biblioteca, TI, financeiro.
 *
 * Tela separada de Usuários porque a origem é outra: estes cadastros não vêm
 * do JACAD, que só conhece aluno e docente. E separada da Comissão porque o
 * papel é outro — o técnico responde a avaliação, não a administra.
 */
import Link from 'next/link';
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { exigirPainel } from '@/lib/sessao';
import { adicionarTecnico, editarTecnico, novaSenhaTecnico, removerTecnico } from './actions';
import { semEmail } from '@/lib/tecnicos';
import { FormComSenha } from '@/components/FormComSenha';

export const dynamic = 'force-dynamic';

const campo =
  'w-full rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-sm text-brand-navy outline-none focus:border-brand-teal';
const rotulo = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400';

const AVISOS: Record<string, string> = {
  criado: 'Cadastro criado.',
  promovido: 'Cadastro que já existia foi convertido — a pessoa mantém o histórico dela.',
  senha: 'Nova senha provisória gerada.',
  'revogado-respondente': 'Acesso revogado. A pessoa continua no sistema como respondente.',
  'revogado-desativado': 'Acesso revogado e cadastro desativado.',
  editado: 'Cadastro atualizado.',
  ativado: 'E-mail informado — o técnico está ativo e já pode entrar em /entrar/tecnico.',
};

export default async function Tecnicos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await exigirPainel();
  const sp = await searchParams;
  const { q, pagina, pular } = lerParams(sp);

  const aviso = typeof sp.ok === 'string' ? AVISOS[sp.ok] : null;
  const erro = typeof sp.erro === 'string' ? sp.erro.slice(0, 300) : null;
  const idEdicao = typeof sp.editar === 'string' ? sp.editar : null;

  const where = {
    deletadoEm: null,
    role: 'TECNICO_ADMIN' as const,
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [total, pessoas, formulario, emEdicao, semEmailTotal] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { nome: 'asc' },
      skip: pular,
      take: POR_PAGINA,
      select: {
        id: true,
        nome: true,
        email: true,
        matricula: true,
        status: true,
        senhaProvisoria: true,
        ultimoAcesso: true,
      },
    }),
    prisma.formTemplate.findFirst({
      where: { publico: 'TECNICO_ADMIN' },
      orderBy: { versao: 'desc' },
      select: { nome: true, status: true },
    }),
    idEdicao
      ? prisma.user.findFirst({
          where: { id: idEdicao, role: 'TECNICO_ADMIN', deletadoEm: null },
          select: { id: true, nome: true, email: true, matricula: true },
        })
      : Promise.resolve(null),
    prisma.user.count({
      where: { role: 'TECNICO_ADMIN', deletadoEm: null, email: { endsWith: '@sem-email.invalid' } },
    }),
  ]);

  return (
    <Lista
      eyebrow="Cadastros"
      titulo="Técnico-administrativo"
      descricao="Secretaria, biblioteca, TI, financeiro e demais setores. Não vêm do JACAD — a API acadêmica só conhece aluno e docente —, então são cadastrados aqui. Respondem a avaliação; não acessam o painel."
      buscaPlaceholder="Buscar por nome ou e-mail…"
      q={q}
      pagina={pagina}
      total={total}
      href="/cadastros/tecnicos"
      colunas={[
        { titulo: 'Nome' },
        { titulo: 'E-mail de acesso' },
        { titulo: 'Matrícula interna', estreita: true },
        { titulo: 'Situação', estreita: true },
        { titulo: 'Último acesso', estreita: true },
        { titulo: '', estreita: true },
      ]}
      linhas={pessoas.map((p) => [
        <span className="font-medium">{p.nome}</span>,
        semEmail(p.email) ? (
          <Etiqueta tom="alerta">sem e-mail</Etiqueta>
        ) : (
          <span className="font-mono text-xs text-slate-500">{p.email}</span>
        ),
        <span className="font-mono text-xs text-slate-400">{p.matricula}</span>,
        p.status !== 'ATIVO' ? (
          <Etiqueta tom="alerta">{p.status.toLowerCase()}</Etiqueta>
        ) : p.senhaProvisoria ? (
          <Etiqueta tom="alerta">senha provisória</Etiqueta>
        ) : (
          <Etiqueta tom="ok">ativo</Etiqueta>
        ),
        <span className="text-xs text-slate-400">
          {p.ultimoAcesso ? p.ultimoAcesso.toLocaleDateString('pt-BR') : 'nunca entrou'}
        </span>,
        <div className="flex gap-1.5">
          <Link
            href={`/cadastros/tecnicos?editar=${p.id}#editar`}
            className="rounded-lg border border-brand-navy/10 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
          >
            Editar
          </Link>
          {!semEmail(p.email) && (
          <FormComSenha acao={novaSenhaTecnico}>
            <input type="hidden" name="userId" value={p.id} />
            <button
              type="submit"
              className="rounded-lg border border-brand-navy/10 px-2.5 py-1 text-[11px] font-semibold text-slate-500 transition-colors hover:border-brand-teal/40 hover:text-brand-teal-hover"
              title="Gera uma nova senha provisória e mostra na tela — a anterior deixa de valer"
            >
              Nova senha
            </button>
          </FormComSenha>
          )}
          <form>
            <button
              formAction={removerTecnico.bind(null, p.id)}
              className="rounded-lg border border-brand-orange/30 px-2.5 py-1 text-[11px] font-semibold text-brand-orange transition-colors hover:bg-brand-orange/10"
              title="Tira o acesso"
            >
              Revogar
            </button>
          </form>
        </div>,
      ])}
      vazio={
        <p className="text-sm text-slate-400">
          Nenhum colaborador cadastrado ainda. Use o formulário acima.
        </p>
      }
    >
      {aviso && (
        <p className="mt-6 rounded-xl border border-brand-navy/10 bg-white px-4 py-3 text-sm text-slate-600">
          {aviso}
        </p>
      )}
      {erro && (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600"
        >
          {erro}
        </p>
      )}
      {semEmailTotal > 0 && (
        <p className="mt-6 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-sm text-slate-600">
          <strong>{semEmailTotal}</strong> técnico{semEmailTotal === 1 ? '' : 's'} sem e-mail —
          inativo{semEmailTotal === 1 ? '' : 's'} até alguém informar o e-mail em <strong>Editar</strong>.
          Sem e-mail não entram na avaliação.
        </p>
      )}

      {emEdicao && (
        <form
          id="editar"
          className="mt-6 rounded-2xl border border-brand-teal/40 bg-white px-5 py-5"
        >
          <p className="font-brand text-sm font-bold text-brand-navy">Editar técnico</p>
          {semEmail(emEdicao.email) && (
            <p className="mt-1 text-xs text-slate-500">
              Este cadastro está sem e-mail. Ao informar um, a conta fica ativa.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
            <label className={rotulo}>
              Nome completo
              <input
                name="nome"
                required
                minLength={3}
                defaultValue={emEdicao.nome}
                className={`${campo} mt-1`}
              />
            </label>
            <label className={rotulo}>
              E-mail
              <input
                type="email"
                name="email"
                required
                defaultValue={semEmail(emEdicao.email) ? '' : emEdicao.email}
                placeholder="nome@insted.edu.br"
                className={`${campo} mt-1`}
              />
            </label>
            <label className={rotulo}>
              Matrícula
              <input
                name="matricula"
                required
                defaultValue={emEdicao.matricula}
                className={`${campo} mt-1 w-36`}
              />
            </label>
            <button
              formAction={editarTecnico.bind(null, emEdicao.id)}
              className="self-end rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
            >
              Salvar
            </button>
            <Link
              href="/cadastros/tecnicos"
              className="self-end px-2 py-2 text-xs font-semibold text-slate-500 hover:text-brand-teal"
            >
              Cancelar
            </Link>
          </div>
        </form>
      )}

      <FormComSenha
        acao={adicionarTecnico}
        className="mt-6 rounded-2xl border border-brand-navy/10 bg-white px-5 py-5"
      >
        <p className="font-brand text-sm font-bold text-brand-navy">Adicionar colaborador</p>
        <p className="mt-1 max-w-2xl text-xs text-slate-500">
          A senha provisória aparece na tela depois de criar; entregue à pessoa por um canal
          diferente do e-mail da conta. Se preferir usar o código de registro do RH, informe em
          matrícula — em branco, o sistema gera um interno.
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
            Matrícula
            <input name="matricula" placeholder="automática" className={`${campo} mt-1 w-36`} />
          </label>
          <button
            type="submit"
            className="self-end rounded-lg bg-brand-teal px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-teal-hover"
          >
            Cadastrar
          </button>
        </div>
      </FormComSenha>

      <p className="mt-3 text-sm">
        <Link
          href="/cadastros/tecnicos/importar"
          className="font-semibold text-brand-teal hover:text-brand-teal-hover"
        >
          Importar vários por planilha →
        </Link>
      </p>

      {formulario ? (
        <p className="mt-4 text-xs text-slate-400">
          Instrumento vinculado a este público: <strong>{formulario.nome}</strong> (
          {formulario.status.toLowerCase()}).
        </p>
      ) : (
        <p className="mt-4 rounded-xl border border-brand-orange/30 bg-brand-orange/5 px-4 py-3 text-xs text-slate-600">
          Ainda não há formulário cadastrado para este público — sem ele, os colaboradores não
          recebem questionário.
        </p>
      )}
    </Lista>
  );
}
