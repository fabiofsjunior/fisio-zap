import './globals.css';
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'FisioZap',
  applicationName: 'FisioZap',
  description: 'Assistente profissional para fisioterapeutas.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FisioZap',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#17352a',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
