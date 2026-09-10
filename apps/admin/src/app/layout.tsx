import type { Metadata } from 'next';
import { Inter, Raleway } from 'next/font/google';
import { Processando } from '@/components/Processando';
import './globals.css';

// Mesmas famílias do Insted Hub Digital: Inter para interface, Raleway
// (a face da logo) para títulos.
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const raleway = Raleway({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--font-raleway',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Avaliação Institucional — Insted',
  description: 'Comissão Própria de Avaliação.',
};

/**
 * Layout raiz — o documento, as fontes e o aviso de processamento.
 *
 * A barra lateral da CPA vive em `(painel)/layout.tsx`. Quem responde à
 * avaliação não vê a navegação administrativa: são dois produtos diferentes
 * na mesma aplicação.
 *
 * `force-dynamic` aqui não é sobre conteúdo: é o que garante que o layout
 * renderize a cada resposta do servidor, gerando uma `marca` nova. É esse
 * valor que faz o aviso de processamento sumir quando a ação termina —
 * inclusive nas que revalidam sem mudar de URL.
 */
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${raleway.variable}`}>
      <body className="min-h-screen bg-brand-light">
        <Processando marca={Date.now()} />
        {children}
      </body>
    </html>
  );
}
