import type { MetadataRoute } from 'next';
import { withBasePath } from '@/server/base-path';

/**
 * Il manifest che rende l'app installabile sul telefono.
 *
 * Aggiunta alla schermata home si apre **senza la barra di Safari**: sono un
 * paio di centimetri di schermo in più, e su un elenco di ordini si vedono.
 * Soprattutto si apre già dentro, senza passare dal browser e dai preferiti.
 *
 * I percorsi passano da `withBasePath` perché l'app vive sotto `/gelateria`:
 * un manifest con `/` dentro manderebbe l'icona della schermata home sulla
 * home del dominio, che è un altro sito.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gelateria Guido — Ordini',
    short_name: 'Ordini',
    description: 'Listini fornitori e ordini della gelateria',
    start_url: withBasePath('/ordini'),
    scope: withBasePath('/'),
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#2f7a4a',
    icons: [
      {
        src: withBasePath('/icona-512.png'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: withBasePath('/apple-touch-icon.png'),
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
