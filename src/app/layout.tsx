import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gelateria Guido — Ordini',
  description: 'Gestione listini fornitori e ordini',
  robots: { index: false, follow: false },
  // Aggiunta alla schermata home si apre a tutto schermo, come un'app.
  appleWebApp: {
    capable: true,
    title: 'Ordini',
    // `default` tiene la barra di stato leggibile su sfondo chiaro; con
    // `black-translucent` il contenuto ci finisce sotto e l'ora si perde.
    statusBarStyle: 'default',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // L'app si usa anche da telefono (decisione D12): lo zoom resta possibile.
  //
  // Non si mette `maximumScale: 1` per impedire l'ingrandimento automatico di
  // iOS quando si tocca un campo: quello toglierebbe lo zoom **anche a chi
  // serve**, e in un magazzino con poca luce serve. L'ingrandimento
  // indesiderato si toglie all'origine, portando i campi a 16px in
  // `globals.css`.
  maximumScale: 5,
  // Il colore della barra di stato quando l'app è installata.
  themeColor: '#2f7a4a',
  // Il contenuto arriva fino ai bordi; la barra dell'ordine si tiene alla
  // larga dalla barra home con `env(safe-area-inset-bottom)`.
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
