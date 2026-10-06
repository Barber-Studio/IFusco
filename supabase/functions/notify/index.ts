// Edge Function "notify": invia push OneSignal. La REST API key resta qui, mai nel frontend.
// Deploy:  supabase functions deploy notify
// Secrets: supabase secrets set ONESIGNAL_APP_ID=... ONESIGNAL_REST_API_KEY=...
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: "non autenticato" }, 401);

  const db = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { event, appointment_id } = await req.json(); // event: new | cancel | update

  const { data: a } = await db.from("appointments").select("*, profiles(nome,cognome), services(name)").eq("id", appointment_id).single();
  const { data: me } = await db.from("profiles").select("ruolo").eq("id", user.id).single();
  const isAdmin = me?.ruolo === "admin";
  if (!a || (!isAdmin && a.user_id !== user.id)) return json({ error: "non autorizzato" }, 403);

  const who = a.profiles ? `${a.profiles.nome} ${a.profiles.cognome}` : (a.client_name ?? "Cliente");
  const when = `${a.appointment_date.split("-").reverse().join("/")} ore ${a.start_time.slice(0, 5)}`;
  const service = a.services?.name ?? "";
  let targets: string[] = [], title = "", body = "";

  if (event === "new" || event === "cancel") {
    const { data: admins } = await db.from("profiles").select("id").eq("ruolo", "admin");
    targets = (admins ?? []).map((x) => x.id);
    title = event === "new" ? "Nuova prenotazione" : "Prenotazione annullata";
    body = `${who} · ${service} · ${when}`;
  } else if (event === "update" && isAdmin && a.user_id) {
    targets = [a.user_id];
    title = a.status === "cancelled" ? "Appuntamento annullato" : "Appuntamento aggiornato";
    body = `${service} · ${when}`;
  } else return json({ error: "evento non valido" }, 400);

  if (!targets.length) return json({ sent: 0 });
  await db.from("notifications").insert(targets.map((id) => ({ user_id: id, title, body })));

  const r = await fetch("https://api.onesignal.com/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${Deno.env.get("ONESIGNAL_REST_API_KEY")}` },
    body: JSON.stringify({
      app_id: Deno.env.get("ONESIGNAL_APP_ID"), target_channel: "push",
      include_aliases: { external_id: targets },
      headings: { en: title, it: title }, contents: { en: body, it: body },
    }),
  });
  return json({ sent: targets.length, onesignal: r.status });
});
