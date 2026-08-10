import { redirect } from 'next/navigation';

/**
 * `/ordini/confermato/…` è confluita in `/ordini/…`.
 *
 * Erano due schermate che mostravano lo stesso ordine congelato, e due copie
 * della stessa vista divergono: una impara a mostrare le note e l'altra no.
 * La rotta resta perché la conferma ci mandava, e qualcuno può averla nei
 * preferiti.
 */
export default async function ConfermatoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/ordini/${id}`);
}
