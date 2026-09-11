/**
 * Corpo técnico-administrativo — secretaria, biblioteca, TI, financeiro.
 *
 * Tela separada de Usuários porque a origem é outra: estes cadastros não vêm
 * do JACAD, que só conhece aluno e docente. E separada da Comissão porque o
 * papel é outro — o técnico responde a avaliação, não a administra.
 */
import { prisma } from '@insted/database';
import { Lista, Etiqueta, lerParams, POR_PAGINA } from '@/components/Lista';
import { exigirPainel } from '@/lib/sessao';
import { adicionarTecnico, novaSenhaTecnico, removerTecnico } from './actions';
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

  const [total, pessoas, formulario] = await Promise.all([
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
        <span className="font-mono text-xs text-slate-500">{p.email}</span>,
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
