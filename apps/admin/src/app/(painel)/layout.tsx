import { Sidebar } from '@/components/Sidebar';
import { exigirPainel } from '@/lib/sessao';

/**
 * Área administrativa da CPA.
 *
 * A guarda aqui protege a navegação — quem não tem sessão administrativa não
 * vê tela nenhuma. Ela NÃO é o que protege as ações: cada Server Action chama
 * `exigirPainel` por conta própria, porque um POST direto ao endpoint da ação
 * não passa por layout algum.
 */
export const dynamic = 'force-dynamic';

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const eu = await exigirPainel();

  return (
    <div className="flex min-h-screen">
      <Sidebar nome={eu.nome} papel={eu.role} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
