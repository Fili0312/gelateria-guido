/**
 * Quello che va fatto una volta sola, all'avvio del server.
 *
 * Next chiama `register()` una volta per istanza, prima di servire la prima
 * richiesta. E' l'unico punto dell'applicazione in cui si puo' eseguire del
 * codice "all'accensione" senza inventarsi un servizio a parte.
 *
 * Qui serve a una cosa sola: far ripartire le lavorazioni dei listini rimaste
 * appese. Un deploy fatto mentre un import stava girando lascia un job che
 * risulta in corso e non lo e' piu'; senza questa ripresa resterebbe cosi'
 * per sempre, e sembrerebbe che stia ancora lavorando.
 */
export async function register() {
  // Il runtime edge non ha ne' filesystem ne' processi figli: la ripresa
  // riguarda solo il server Node.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Import dinamico: il modulo apre la connessione al database, e non deve
  // essere caricato quando questo file viene valutato in altri contesti.
  const { riprendiJobInterrotti } = await import('@/server/import/runner');
  try {
    const ripresi = await riprendiJobInterrotti();
    if (ripresi > 0) console.log(`Riprese ${ripresi} lavorazioni di listini rimaste in sospeso.`);
  } catch (errore) {
    // Un guasto qui non deve impedire al server di partire: senza ripresa
    // l'app funziona, con il server spento no.
    console.error('Ripresa delle lavorazioni fallita:', errore);
  }
}
