import { redirect } from 'next/navigation';

/**
 * «Da abbinare» è confluita in «Confronti».
 *
 * La separazione fra le due era comoda per chi ha scritto il codice, non per
 * chi le usa: decidere gli abbinamenti è **il motivo per cui** i confronti
 * sono pochi, e tenerli in due schermate faceva guardare il risultato senza
 * sapere che la causa stava altrove.
 *
 * La rotta resta e reindirizza: era linkata dalla panoramica, dai listini e
 * probabilmente da qualche segnalibro.
 */
export default function AbbinamentiPage() {
  redirect('/convenienti');
}
