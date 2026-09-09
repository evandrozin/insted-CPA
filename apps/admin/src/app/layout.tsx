import type { Metadata } from 'next';
import { Inter, Raleway } from 'next/font/google';
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
 * Layout raiz — só o documento e as fontes.
 *
 * A barra lateral da CPA vive em `(painel)/layout.tsx`. Quem responde à
 * avaliação não vê a navegação administrativa: são dois produtos diferentes
 * na mesma aplicação.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${raleway.variable}`}>
      <body className="min-h-screen bg-brand-light">{children}</body>
    </html>
  );
}
