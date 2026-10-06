/* ============================================================
   IFUSCO · configurazione e connessione Supabase
   Qui si modifica tutto cio' che e' "impostazione" del locale.
   ============================================================ */
const CONFIG = {
  // Chiavi PUBBLICHE (anon key). Mai inserire la service role key.
  SUPABASE_URL: "https://qirrfipvnntlgutkitgf.supabase.co/rest/v1/",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcnJmaXB2bm50bGd1dGtpdGdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMTU1NTQsImV4cCI6MjEwNjg5MTU1NH0.vH4vfShPG5uXA_EAycJ5vHOl59MIOWoXNARje1_NPuI",
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

  // Servizi di esempio mostrati finche' Supabase non e' collegato (anteprima). Quelli veri stanno nella tabella "services".
  DEMO_SERVICES: [
    { id: 1, name: "Taglio capelli", description: "Taglio a forbice o macchina, con rifinitura a rasoio.", price: 18, duration_min: 30 },
    { id: 2, name: "Sfumatura", description: "Sfumatura alta, media o bassa, curata nei dettagli.", price: 20, duration_min: 30 },
    { id: 3, name: "Barba", description: "Modellatura, panno caldo e rifinitura a rasoio.", price: 12, duration_min: 30 },
    { id: 4, name: "Taglio + barba", description: "Il servizio completo in un unico appuntamento.", price: 28, duration_min: 60 },
    { id: 5, name: "Rasatura classica", description: "Rasatura a rasoio con panno caldo e olio pre-barba.", price: 18, duration_min: 30 },
    { id: 6, name: "Taglio ragazzo", description: "Fino a 14 anni.", price: 14, duration_min: 30 },
    { id: 7, name: "Shampoo e styling", description: "Lavaggio, massaggio e messa in piega.", price: 10, duration_min: 30 },
    { id: 8, name: "Colore", description: "Copertura dei capelli bianchi o colore, consulenza inclusa.", price: 25, duration_min: 60 },
    { id: 9, name: "Pulizia viso", description: "Detersione, scrub e maschera per una pelle curata.", price: 15, duration_min: 30 },
  ],
};

const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
