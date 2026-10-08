import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'FisioZap',
    short_name: 'FisioZap',
    description: 'Assistente profissional para fisioterapeutas.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f7f5',
    theme_color: '#17352a',
    lang: 'pt-BR',
    orientation: 'portrait',
  };
}
