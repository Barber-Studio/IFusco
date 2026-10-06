/* ============================================================
   IFUSCO · configurazione e connessione Supabase
   Qui si modifica tutto cio' che e' "impostazione" del locale.
   ============================================================ */
const CONFIG = {
  // Chiavi PUBBLICHE (anon key). Mai inserire la service role key.
  SUPABASE_URL: "https://INSERISCI-PROGETTO.supabase.co",
  SUPABASE_ANON_KEY: "INSERISCI-ANON-KEY",
  ONESIGNAL_APP_ID: "INSERISCI-ONESIGNAL-APP-ID",

  // Login con telefono + PIN: Supabase richiede un'email, la costruiamo dal telefono (mai mostrata).
  EMAIL_DOMAIN: "ifusco.app",
  PIN_SUFFIX: "#ifusco",           // allunga il PIN per rispettare i 6 caratteri minimi di Supabase

  // Slot prenotabili (30 minuti, continuati, nessuna pausa). Per cambiare gli orari modifica solo questa lista.
  SLOTS: ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30",
          "14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30",
          "19:00","19:30","20:00"],
  SLOT_MIN: 30,
  OPEN_DAYS: [2,3,4,5,6],          // 0 = domenica ... 2 = martedi ... 6 = sabato
  STAFF: [1,2],                    // due collaboratori = due fasce parallele
  STAFF_NAMES: { 1: "Fascia 1", 2: "Fascia 2" },
  BOOKING_DAYS_AHEAD: 28,
};

const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
