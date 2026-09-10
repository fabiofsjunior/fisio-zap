import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FisioZap',
  description: 'Assistente profissional para fisioterapeutas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
