/* ============================================================
   IFUSCO · OneSignal (push). La chiave REST sta nella Edge Function "notify".
   ============================================================ */
window.OneSignalDeferred = window.OneSignalDeferred || [];
OneSignalDeferred.push(async (OS) => {
  await OS.init({ appId: CONFIG.ONESIGNAL_APP_ID });
});

/** Collega (o scollega) il dispositivo all'ID utente Supabase. */
function setupOneSignalUser(userId) {
  OneSignalDeferred.push(async (OS) => (userId ? OS.login(userId) : OS.logout()));
}

/** Chiede il permesso push. Ritorna true se concesso. */
function requestOneSignalNotifications() {
  return new Promise((resolve) =>
    OneSignalDeferred.push(async (OS) => {
      await OS.Notifications.requestPermission();
      resolve(OS.Notifications.permission === true);
    })
  );
}

/** Avvisa l'admin: event = "new" | "cancel". */
async function notifyAdmin(event, appointmentId) {
  const { error } = await db.functions.invoke("notify", { body: { event, appointment_id: appointmentId } });
  if (error) console.warn("Notifica admin non inviata:", error.message);
}

/** Avvisa il cliente di una modifica/annullamento fatto dall'admin. */
async function notifyCustomer(appointmentId) {
  const { error } = await db.functions.invoke("notify", { body: { event: "update", appointment_id: appointmentId } });
  if (error) console.warn("Notifica cliente non inviata:", error.message);
}
