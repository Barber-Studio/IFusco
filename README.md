# IFUSCO · Barbershop

Sito di prenotazione in HTML, CSS e JavaScript puro. Supabase come database, OneSignal per le notifiche push. Nessun build: si pubblica su GitHub Pages così com'è.

## File
- `index.html` struttura · `style.css` grafica · `app.js` logica
- `supabase.js` configurazione (chiavi pubbliche, orari, slot, giorni, fasce)
- `onesignal.js` notifiche push · `OneSignalSDKWorker.js` service worker (deve stare nella root)
- `supabase/schema.sql` tabelle, regole di sicurezza (RLS) e controlli anti-sovrapposizione
- `supabase/functions/notify/index.ts` invia le push (la chiave OneSignal resta lì, non nel sito)

## Messa online in 6 passi
1. **Supabase**: crea un progetto, apri SQL Editor, incolla ed esegui `supabase/schema.sql`.
2. **Authentication > Providers > Email**: disattiva *Confirm email* (il login usa telefono + PIN, l'email interna è costruita dal telefono).
3. **supabase.js**: inserisci `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `ONESIGNAL_APP_ID`.
4. **OneSignal**: crea l'app Web, imposta l'URL del sito. Poi pubblica la funzione:
   `supabase functions deploy notify` e
   `supabase secrets set ONESIGNAL_APP_ID=... ONESIGNAL_REST_API_KEY=...`
5. **Carica la cartella su GitHub** e attiva Pages. Dal sito registrati con il tuo telefono, poi in SQL Editor:
   `update profiles set ruolo = 'admin' where telefono = '3331234567';`
6. Facoltativo: metti una foto in `assets/hero.jpg` per la home. Il logo è `assets/logo.svg` (sostituiscilo con il tuo mantenendo lo stesso nome). Cambia indirizzo, telefono e social in `index.html`.

## Come funziona
- **Slot**: 30 minuti, due fasce parallele (due collaboratori), da martedì a sabato. Gli orari sono la lista `SLOTS` in `supabase.js`.
- **Servizi**: tabella `services` (nome, descrizione, prezzo, durata, attivo). Modificala dal Table Editor di Supabase: il sito si aggiorna da solo. La durata occupa più slot consecutivi (orario continuato 09:00–20:30, nessuna pausa).
- **Sovrapposizioni**: bloccate sia dal sito sia da un trigger nel database, quindi due clienti non possono prenotare lo stesso orario nemmeno premendo insieme.
- **Slot passati**: uno slot è non disponibile appena l'ora locale lo supera (17:01 → 17:00 no, 17:30 sì).
- **Admin**: Agenda con le due fasce, creazione/modifica/annullamento/spostamento, "Blocca questo slot", "Sblocca fascia" e incassi previsti (giorno, settimana, mese). I clienti non vedono l'Agenda e le regole RLS impediscono comunque l'accesso ai dati.
- **Notifiche**: nuova prenotazione e annullamento arrivano agli admin; modifiche e annullamenti fatti dall'admin arrivano al cliente.

## Note
- Il PIN è 4–6 cifre; internamente viene allungato con `PIN_SUFFIX` per rispettare i 6 caratteri minimi di Supabase.
- Per "recuperare PIN" l'admin può reimpostarlo dalla dashboard Supabase (Authentication > Users).
