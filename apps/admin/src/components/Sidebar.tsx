import Image from 'next/image';
import Link from 'next/link';
import { sair } from '@/app/entrar/actions';

type Item = {
  href: string;
  label: string;
  /** Fase do roadmap em que a tela entra. Null = já disponível. */
  fase: number | null;
};

const grupos: { titulo: string; itens: Item[] }[] = [
  {
    titulo: 'Visão geral',
    itens: [{ href: '/', label: 'Painel', fase: null }],
  },
  {
    titulo: 'Integrações',
    itens: [{ href: '/integracoes/jacad', label: 'Importar do JACAD', fase: null }],
  },
  {
    titulo: 'Cadastros',
    itens: [
      { href: '/cadastros/cursos', label: 'Cursos', fase: null },
      { href: '/cadastros/disciplinas', label: 'Disciplinas', fase: null },
      { href: '/cadastros/turmas', label: 'Turmas', fase: null },
      { href: '/cadastros/salas', label: 'Salas', fase: null },
      { href: '/cadastros/usuarios', label: 'Usuários', fase: null },
      { href: '/cadastros/comissao', label: 'Comissão', fase: null },
      { href: '/cadastros/importar', label: 'Importar planilha', fase: null },
    ],
  },
  {
    titulo: 'Vínculos',
    itens: [
      { href: '/alocacoes/matriculas', label: 'Matrículas', fase: null },
      { href: '/alocacoes/docentes', label: 'Alocações docentes', fase: null },
    ],
  },
  {
    titulo: 'Avaliação',
    itens: [
      { href: '/formularios', label: 'Formulários', fase: null },
      { href: '/periodos', label: 'Ciclos anuais', fase: null },
      { href: '/periodos/adesao', label: 'Adesão ao vivo', fase: 3 },
    ],
  },
  {
    titulo: 'Resultados',
    itens: [
      { href: '/relatorios', label: 'Relatórios', fase: 4 },
      { href: '/relatorios/comentarios', label: 'Moderação', fase: 4 },
      { href: '/relatorios/exportar', label: 'Exportação', fase: 4 },
    ],
  },
];

const PAPEL: Record<string, string> = { ADMIN: 'Administração', GESTOR: 'Coordenação' };

export function Sidebar({ nome, papel }: { nome: string; papel: string }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-brand-navy/10 bg-white xl:w-64">
      <div className="border-b border-brand-navy/10 px-5 py-5">
        <Image
          src="/logo-insted.png"
          alt="Insted Centro Universitário"
          width={550}
          height={162}
          className="h-9 w-auto"
          priority
        />
        <p className="mt-3 font-brand text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-teal">
          CPA
        </p>
        <p className="mt-0.5 text-sm font-semibold text-brand-navy">Avaliação Institucional</p>
      </div>

      <nav className="flex flex-1 flex-col gap-6 px-3 py-5">
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {grupo.titulo}
            </p>
            <ul className="flex flex-col gap-0.5">
              {grupo.itens.map((item) =>
                item.fase === null ? (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-lg px-2.5 py-2 text-sm font-medium text-brand-navy transition-colors hover:bg-brand-teal/10 hover:text-brand-teal-hover"
                    >
                      {item.label}
                    </Link>
                  </li>
                ) : (
                  <li
                    key={item.href}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 text-sm text-slate-400"
                    title={`Entra na Fase ${item.fase} do roadmap`}
                  >
                    <span>{item.label}</span>
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 tabular-nums">
                      F{item.fase}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-brand-navy/10 px-5 py-4">
        <p className="truncate text-sm font-semibold text-brand-navy" title={nome}>
          {nome}
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          {PAPEL[papel] ?? papel}
        </p>
        <form className="mt-3">
          <button
            formAction={sair}
            className="w-full rounded-lg border border-brand-navy/10 px-3 py-1.5 text-xs font-semibold text-slate-500 transition-colors hover:border-brand-orange/40 hover:text-brand-orange"
          >
            Sair
          </button>
        </form>
      </div>
    </aside>
  );
}
