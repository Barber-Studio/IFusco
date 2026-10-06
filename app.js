/* ============================================================
   I FUSCO · logica applicazione
   Sezioni: helper · disponibilita' · auth · routing · home · prenota · profilo · agenda admin · avvio
   ============================================================ */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const state = {
  user: null, profile: null, services: [], customers: null,
  book: { service: null, date: null, time: null, staff: null, busy: [] },
  agDate: ymd(new Date()), ag: { appts: [], blocks: [] },
};

/* ---------- helper ---------- */
const pad = (n) => String(n).padStart(2, "0");
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; } // data LOCALE, non UTC
const parseYmd = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const toMin = (t) => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const fromMin = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;
const hhmm = (t) => t.slice(0, 5);
const euro = (n) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n || 0);
const fmtDay = (s, o = { weekday: "long", day: "numeric", month: "long" }) => parseYmd(s).toLocaleDateString("it-IT", o);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isAdmin = () => state.profile?.ruolo === "admin";
const svcById = (id) => state.services.find((s) => s.id === +id);
const clientName = (a) => (a.profiles ? `${a.profiles.nome} ${a.profiles.cognome}` : a.client_name || "Cliente");

let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
}
function dbError(msg = "") {
  if (msg.includes("slot_occupato")) return "Questo orario non è più disponibile.";
  if (msg.includes("orario_passato")) return "Non puoi prenotare un orario passato.";
  if (msg.includes("giorno_chiuso")) return "Il locale è chiuso in questo giorno.";
  if (msg.includes("duplicate")) return "Esiste già un blocco su questo slot.";
  return "Operazione non riuscita. Riprova.";
}

/* ---------- disponibilita' (stessa logica per cliente e admin) ---------- */
const SLOT_SET = new Set(CONFIG.SLOTS);
const slotsNeeded = (min) => Math.ceil(min / CONFIG.SLOT_MIN);
// Un orario e' "passato" appena l'ora locale lo supera: alle 17:01 -> 17:00 no, 17:30 si.
const isPast = (date, time) => new Date(`${date}T${time}:00`) < new Date();

/** Da righe {staff,start_time,duration_min,kind} a {1:Set, 2:Set} di orari occupati. */
function occupancy(rows) {
  const occ = Object.fromEntries(CONFIG.STAFF.map((s) => [s, new Set()]));
  rows.forEach((r) => {
    const start = toMin(hhmm(r.start_time));
    for (let m = 0; m < r.duration_min; m += CONFIG.SLOT_MIN) occ[r.staff]?.add(fromMin(start + m));
  });
  return occ;
}
/** Primo collaboratore libero per n slot consecutivi (tutti dentro gli orari di apertura), altrimenti null. */
function freeStaff(occ, time, n) {
  return CONFIG.STAFF.find((s) =>
    Array.from({ length: n }, (_, k) => fromMin(toMin(time) + k * CONFIG.SLOT_MIN))
      .every((t) => SLOT_SET.has(t) && !occ[s].has(t))
  ) ?? null;
}

/* ---------- autenticazione (telefono + PIN su Supabase Auth) ---------- */
const phoneEmail = (tel) => `${tel}@${CONFIG.EMAIL_DOMAIN}`;
const pinPassword = (pin) => pin + CONFIG.PIN_SUFFIX;

function openAuth(mode = "login") {
  const dlg = $("#authDlg"); setAuthMode(mode); $("#authErr").textContent = ""; dlg.showModal();
}
function setAuthMode(mode) {
  const reg = mode === "register";
  $("#authDlg").classList.toggle("register", reg);
  $$("#authDlg [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === mode));
  $("#authSubmit").textContent = reg ? "Crea account" : "Accedi";
}
async function submitAuth(e) {
  e.preventDefault();
  const f = Object.fromEntries(new FormData(e.target));
  const reg = $("#authDlg").classList.contains("register");
  const err = (m) => ($("#authErr").textContent = m);
  const tel = (f.telefono || "").replace(/\D/g, "");
  if (tel.length < 6) return err("Inserisci un numero di telefono valido.");
  if (!/^\d{4,6}$/.test(f.pin)) return err("Il PIN deve avere da 4 a 6 cifre.");

  let res;
  if (reg) {
    if (!f.nome.trim() || !f.cognome.trim()) return err("Inserisci nome e cognome.");
    if (f.pin !== f.pin2) return err("I due PIN non coincidono.");
    res = await db.auth.signUp({
      email: phoneEmail(tel), password: pinPassword(f.pin),
      options: { data: { nome: f.nome.trim(), cognome: f.cognome.trim(), telefono: tel } }, // il trigger SQL crea il profilo
    });
  } else {
    res = await db.auth.signInWithPassword({ email: phoneEmail(tel), password: pinPassword(f.pin) });
  }
  if (res.error) {
    const m = res.error.message;
    return err(m.includes("already") ? "Numero già registrato. Usa Accedi." : m.includes("Invalid login") ? "Telefono o PIN non corretti." : "Accesso non riuscito. Riprova.");
  }
  if (!res.data.session) return err("Account creato, ma serve disattivare la conferma email in Supabase (vedi README).");
  $("#authDlg").close(); e.target.reset(); toast(reg ? "Benvenuto da I FUSCO" : "Accesso effettuato");
}
async function applySession(session) {
  state.user = session?.user ?? null; state.profile = null;
  if (state.user) {
    const { data } = await db.from("profiles").select("*").eq("id", state.user.id).single();
    state.profile = data;
  }
  setupOneSignalUser(state.user?.id);
  $$("[data-admin]").forEach((el) => (el.hidden = !isAdmin())); // "Agenda" solo per admin (la sicurezza vera e' nelle RLS)
}

/* ---------- routing ---------- */
const VIEWS = ["home", "book", "appointments", "agenda", "profile"];
function currentView() { return $("[data-view]:not([hidden])")?.dataset.view; }
function route() {
  let v = location.hash.slice(1);
  if (!VIEWS.includes(v)) v = "home";
  if (v === "agenda" && !isAdmin()) v = "home";
  if ((v === "profile" || v === "appointments") && !state.user) { openAuth("login"); v = "home"; if (location.hash !== "#home") location.hash = "#home"; }
  $$("[data-view]").forEach((s) => (s.hidden = s.dataset.view !== v));
  $$("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === v));
  window.scrollTo(0, 0);
  ({ book: renderBook, appointments: renderAppointments, profile: renderProfile, agenda: renderAgenda }[v] || (() => {}))();
  reveal();
}

/* ---------- servizi / home ---------- */
async function loadServices() {
  const { data, error } = await db.from("services").select("*").eq("active", true).order("sort");
  state.demo = !!error || !data?.length; // senza Supabase collegato: anteprima con servizi di esempio
  state.services = state.demo ? CONFIG.DEMO_SERVICES : data;
  $("#homeServices").innerHTML = state.services.map((s, i) => `
    <li class="service-row" data-reveal style="--d:${i * 90}ms">
      <h3>${esc(s.name)}</h3>
      <p>${esc(s.description)}</p>
      <div class="service-meta">${euro(s.price)}<small>${s.duration_min} min</small></div>
      <button class="btn btn-line btn-sm" data-pick="${s.id}">Scegli</button>
    </li>`).join("") || '<li class="muted">Servizi in arrivo.</li>';
}

/* ---------- prenotazione cliente ---------- */
function openDays() {
  const now = new Date(), out = [];
  for (let i = 0; i <= CONFIG.BOOKING_DAYS_AHEAD; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (CONFIG.OPEN_DAYS.includes(d.getDay())) out.push(d);
  }
  return out;
}
function renderBook() {
  const b = state.book;
  $("#bookServices").innerHTML = state.services.map((s) => `
    <button class="pick" data-service="${s.id}" aria-pressed="${b.service === s.id}">
      <span>${esc(s.name)}<small>${s.duration_min} min</small></span><b>${euro(s.price)}</b></button>`).join("");
  $("#bookDays").innerHTML = openDays().map((d) => `
    <button class="day" data-date="${ymd(d)}" aria-pressed="${b.date === ymd(d)}">
      <small>${d.toLocaleDateString("it-IT", { weekday: "short" })}</small><b>${d.getDate()}</b>
      <small>${d.toLocaleDateString("it-IT", { month: "short" })}</small></button>`).join("");
  loadSlots();
}
async function loadSlots() {
  const b = state.book, box = $("#bookSlots");
  b.time = null; b.staff = null; updateSummary();
  if (!b.service || !b.date) { box.innerHTML = '<p class="muted">Scegli prima servizio e giorno.</p>'; return; }
  box.innerHTML = '<p class="muted">Controllo disponibilità…</p>';
  const key = `${b.service}|${b.date}`;
  const { data, error } = state.demo ? { data: [], error: null } : await db.rpc("get_busy", { p_date: b.date });
  if (key !== `${b.service}|${b.date}`) return; // l'utente ha cambiato scelta nel frattempo
  if (error) { box.innerHTML = '<p class="error">Impossibile leggere la disponibilità.</p>'; return; }
  b.busy = data;
  const occ = occupancy(data), n = slotsNeeded(svcById(b.service).duration_min);
  box.innerHTML = CONFIG.SLOTS.map((t, i) => {
    const ok = !isPast(b.date, t) && freeStaff(occ, t, n) !== null;
    return `<button class="slot" style="--d:${i * 20}ms" data-time="${t}" aria-pressed="false" ${ok ? "" : "disabled"}>${t}</button>`;
  }).join("");
}
function updateSummary() {
  const b = state.book, s = svcById(b.service);
  $("#bookSummary").textContent = s && b.date && b.time
    ? `${s.name} · ${fmtDay(b.date)} · ${b.time} · ${euro(s.price)}` : "Nessuna selezione.";
  $("#bookBtn").disabled = !(s && b.date && b.time);
}
async function confirmBooking() {
  if (state.demo) { toast("Anteprima: collega Supabase per salvare le prenotazioni."); return; }
  if (!state.user) { openAuth("login"); return; }
  const b = state.book, svc = svcById(b.service), btn = $("#bookBtn");
  btn.disabled = true;
  // ricontrollo in tempo reale subito prima di salvare
  const { data: busy } = await db.rpc("get_busy", { p_date: b.date });
  const staff = freeStaff(occupancy(busy || []), b.time, slotsNeeded(svc.duration_min));
  if (staff === null || isPast(b.date, b.time)) { toast("Orario appena occupato. Scegline un altro."); return loadSlots(); }
  const { data, error } = await db.from("appointments")
    .insert({ user_id: state.user.id, service_id: svc.id, appointment_date: b.date, start_time: b.time, staff })
    .select().single();
  if (error) { toast(dbError(error.message)); return loadSlots(); }
  notifyAdmin("new", data.id);
  toast("Prenotazione confermata"); b.time = null; location.hash = "#appointments";
}

/* ---------- profilo cliente ---------- */
const STATUS = { confirmed: "Confermato", completed: "Completato", cancelled: "Annullato" };
function renderProfile() {
  const f = $("#profileForm").elements, p = state.profile || {};
  f.nome.value = p.nome || ""; f.cognome.value = p.cognome || ""; f.telefono.value = p.telefono || "";
  db.from("notifications").select("*").order("created_at", { ascending: false }).limit(8).then(({ data }) => {
    $("#notifList").innerHTML = (data || []).map((n) =>
      `<li><div><b>${esc(n.title)}</b><small>${esc(n.body)}</small></div></li>`).join("");
  });
}
async function renderAppointments() {
  const { data: ap } = await db.from("appointments").select("*, services(name)").eq("user_id", state.user.id)
    .order("appointment_date", { ascending: false }).order("start_time", { ascending: false });
  const future = (a) => a.status === "confirmed" && new Date(`${a.appointment_date}T${hhmm(a.start_time)}:00`) >= new Date();
  const item = (a, i) => `<li style="animation-delay:${i * 60}ms"><div><b>${esc(a.services?.name)}</b><small>${fmtDay(a.appointment_date)} · ${hhmm(a.start_time)}</small></div>
    <div><span class="status ${a.status}">${STATUS[a.status]}</span>
    ${future(a) ? `<button class="link" data-cancel="${a.id}">Annulla</button>` : ""}</div></li>`;
  const list = ap || [];
  $("#apNext").innerHTML = list.filter(future).reverse().map(item).join("") || '<li class="muted">Nessun appuntamento in programma.</li>';
  $("#apPast").innerHTML = list.filter((a) => !future(a)).map(item).join("") || '<li class="muted">Ancora nessuno storico.</li>';
}
async function saveProfile(e) {
  e.preventDefault(); const f = e.target.elements;
  const { error } = await db.from("profiles").update({ nome: f.nome.value.trim(), cognome: f.cognome.value.trim() }).eq("id", state.user.id);
  if (error) return toast("Salvataggio non riuscito.");
  state.profile.nome = f.nome.value.trim(); state.profile.cognome = f.cognome.value.trim(); toast("Dati salvati");
}
async function cancelOwn(id) {
  if (!confirm("Vuoi annullare questo appuntamento?")) return;
  const { error } = await db.rpc("cancel_my_appointment", { p_id: +id });
  if (error) return toast("Impossibile annullare.");
  notifyAdmin("cancel", +id); toast("Appuntamento annullato"); renderAppointments();
}

/* ---------- agenda admin ---------- */
async function renderAgenda() {
  const d = state.agDate; $("#agDate").value = d;
  const [ap, bl] = await Promise.all([
    db.from("appointments").select("*, profiles(nome,cognome,telefono), services(name)").eq("appointment_date", d).neq("status", "cancelled"),
    db.from("availability_blocks").select("*").eq("block_date", d),
  ]);
  state.ag = { appts: ap.data || [], blocks: bl.data || [] };
  renderGrid(); renderRevenue();
}
function agendaCell(t, s) {
  const { appts, blocks } = state.ag, x = toMin(t);
  const a = appts.find((r) => r.staff === s && x >= toMin(hhmm(r.start_time)) && x < toMin(hhmm(r.start_time)) + r.duration_min);
  if (a) {
    return hhmm(a.start_time) === t
      ? `<button class="cell appt ${a.status}" data-act="appt" data-id="${a.id}"><b>${esc(clientName(a))}</b><small>${esc(a.services?.name)} · ${euro(a.price)}</small></button>`
      : `<button class="cell cont" data-act="appt" data-id="${a.id}" aria-label="continua"></button>`;
  }
  const b = blocks.find((r) => r.staff === s && hhmm(r.block_time) === t);
  if (b) return `<div class="cell block"><b>Bloccato</b>${b.note ? `<small>${esc(b.note)}</small>` : ""}<button data-act="unblock" data-id="${b.id}">Sblocca fascia</button></div>`;
  return `<button class="cell free ${isPast(state.agDate, t) ? "past" : ""}" data-act="free" data-t="${t}" data-s="${s}">Libero</button>`;
}
function renderGrid() {
  const grid = $("#agGrid");
  if (!CONFIG.OPEN_DAYS.includes(parseYmd(state.agDate).getDay())) {
    grid.innerHTML = '<p class="muted" style="grid-column:1/-1;padding:16px">Il locale è chiuso in questo giorno.</p>'; return;
  }
  grid.innerHTML = `<div class="ag-head"></div>${CONFIG.STAFF.map((s) => `<div class="ag-head">${CONFIG.STAFF_NAMES[s]}</div>`).join("")}` +
    CONFIG.SLOTS.map((t) => `<div class="ag-time">${t}</div>${CONFIG.STAFF.map((s) => agendaCell(t, s)).join("")}`).join("");
}
async function renderRevenue() {
  const d = parseYmd(state.agDate), dow = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow), sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const first = new Date(d.getFullYear(), d.getMonth(), 1), last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const sum = async (a, b) => {
    const { data } = await db.from("appointments").select("price").gte("appointment_date", ymd(a)).lte("appointment_date", ymd(b)).in("status", ["confirmed", "completed"]);
    return (data || []).reduce((t, r) => t + Number(r.price || 0), 0);
  };
  const [day, week, month] = await Promise.all([sum(d, d), sum(mon, sun), sum(first, last)]);
  $("#agRevenue").innerHTML = [["Incasso previsto giorno", day], ["Settimana", week], ["Mese", month]]
    .map(([l, v]) => `<div><small>${l}</small><b>${euro(v)}</b></div>`).join("");
}
function shiftAgenda(days) { const d = parseYmd(state.agDate); d.setDate(d.getDate() + days); state.agDate = ymd(d); renderAgenda(); }

let editing = null; // prenotazione in modifica (null = nuova)
async function openApptDlg(appt, def = {}) {
  editing = appt;
  const f = $("#apptForm").elements;
  if (!state.customers) {
    const { data } = await db.from("profiles").select("id,nome,cognome,telefono").eq("ruolo", "customer").order("nome");
    state.customers = data || [];
  }
  f.user_id.innerHTML = '<option value="">Nessuno</option>' + state.customers.map((c) => `<option value="${c.id}">${esc(c.nome)} ${esc(c.cognome)} · ${esc(c.telefono)}</option>`).join("");
  const svcs = [...state.services];
  if (appt && !svcById(appt.service_id)) svcs.push({ id: appt.service_id, name: appt.services?.name || "Servizio" });
  f.service_id.innerHTML = svcs.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("");
  f.start_time.innerHTML = CONFIG.SLOTS.map((t) => `<option>${t}</option>`).join("");
  f.staff.innerHTML = CONFIG.STAFF.map((s) => `<option value="${s}">${CONFIG.STAFF_NAMES[s]}</option>`).join("");
  f.user_id.value = appt?.user_id || ""; f.client_name.value = appt?.client_name || "";
  f.service_id.value = appt?.service_id || svcs[0]?.id;
  f.appointment_date.value = appt?.appointment_date || state.agDate;
  f.start_time.value = appt ? hhmm(appt.start_time) : def.time;
  f.staff.value = appt?.staff || def.staff; f.status.value = appt?.status || "confirmed"; f.note.value = appt?.note || "";
  $("#apptTitle").textContent = appt ? "Modifica prenotazione" : "Nuova prenotazione";
  $("#apptCancel").hidden = !appt; $("#apptBlock").hidden = !!appt; $("#apptErr").textContent = "";
  $("#apptDlg").showModal();
}
function apptPayload() {
  const f = $("#apptForm").elements;
  return {
    user_id: f.user_id.value || null, client_name: f.client_name.value.trim() || null, service_id: +f.service_id.value,
    appointment_date: f.appointment_date.value, start_time: f.start_time.value, staff: +f.staff.value,
    status: f.status.value, note: f.note.value.trim() || null,
  };
}
async function saveAppt(e) {
  e.preventDefault();
  const p = apptPayload(), err = (m) => ($("#apptErr").textContent = m);
  if (!p.user_id && !p.client_name) return err("Scegli un cliente o scrivi un nome.");
  const q = editing ? db.from("appointments").update(p).eq("id", editing.id) : db.from("appointments").insert(p);
  const { data, error } = await q.select().single();
  if (error) return err(dbError(error.message));
  $("#apptDlg").close();
  if (editing && data.user_id) notifyCustomer(data.id);
  toast("Salvato"); renderAgenda();
}
async function cancelAppt() {
  if (!confirm("Annullare questa prenotazione?")) return;
  const { data, error } = await db.from("appointments").update({ status: "cancelled" }).eq("id", editing.id).select().single();
  if (error) return ($("#apptErr").textContent = dbError(error.message));
  $("#apptDlg").close(); if (data.user_id) notifyCustomer(data.id);
  toast("Prenotazione annullata"); renderAgenda();
}
async function blockSlot() {
  const p = apptPayload();
  const { error } = await db.from("availability_blocks").insert({
    block_date: p.appointment_date, block_time: p.start_time, staff: p.staff, user_id: p.user_id, note: p.note || p.client_name,
  });
  if (error) return ($("#apptErr").textContent = dbError(error.message));
  $("#apptDlg").close(); toast("Slot bloccato"); renderAgenda();
}
async function unblock(id) {
  const { error } = await db.from("availability_blocks").delete().eq("id", id);
  if (error) return toast("Impossibile sbloccare.");
  toast("Fascia sbloccata"); renderAgenda();
}

/* ---------- eventi ---------- */
function bindEvents() {
  window.addEventListener("hashchange", route);
  $("#authForm").addEventListener("submit", submitAuth);
  $("#profileForm").addEventListener("submit", saveProfile);
  $("#apptForm").addEventListener("submit", saveAppt);
  $("#apptCancel").addEventListener("click", cancelAppt);
  $("#apptBlock").addEventListener("click", blockSlot);
  $("#bookBtn").addEventListener("click", confirmBooking);
  $("#pushBtn").addEventListener("click", async () => toast((await requestOneSignalNotifications()) ? "Notifiche attivate" : "Notifiche non attivate"));
  $("#bellBtn").addEventListener("click", () => { state.user ? (location.hash = "#profile", requestOneSignalNotifications()) : openAuth("login"); });
  $("#logoutBtn").addEventListener("click", async () => { await db.auth.signOut(); location.hash = "#home"; toast("Hai effettuato l'uscita"); });
  $("#privacyLink").addEventListener("click", (e) => { e.preventDefault(); toast("Aggiungi qui la tua informativa privacy."); });
  $("#agPrev").addEventListener("click", () => shiftAgenda(-1));
  $("#agNext").addEventListener("click", () => shiftAgenda(1));
  $("#agToday").addEventListener("click", () => { state.agDate = ymd(new Date()); renderAgenda(); });
  $("#agDate").addEventListener("change", (e) => { if (e.target.value) { state.agDate = e.target.value; renderAgenda(); } });

  // deleghe di click
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a"); if (!t) return;
    if (t.dataset.close !== undefined) t.closest("dialog").close();
    if (t.dataset.tab) setAuthMode(t.dataset.tab);
    if (t.dataset.scroll) document.getElementById(t.dataset.scroll).scrollIntoView();
    if (t.dataset.pick) { state.book.service = +t.dataset.pick; location.hash = "#book"; }
    if (t.dataset.cancel) cancelOwn(t.dataset.cancel);
    if (t.dataset.service) { state.book.service = +t.dataset.service; renderBook(); }
    if (t.dataset.date) { state.book.date = t.dataset.date; renderBook(); }
    if (t.dataset.time) {
      const b = state.book, n = slotsNeeded(svcById(b.service).duration_min);
      b.time = t.dataset.time; b.staff = freeStaff(occupancy(b.busy), b.time, n);
      $$("#bookSlots .slot").forEach((s) => s.setAttribute("aria-pressed", s === t));
      updateSummary();
    }
    // agenda
    const act = t.dataset.act, id = +t.dataset.id;
    if (act === "appt") openApptDlg(state.ag.appts.find((a) => a.id === id));
    if (act === "free") openApptDlg(null, { time: t.dataset.t, staff: +t.dataset.s });
    if (act === "unblock") unblock(id);
  });
}

/* ---------- movimento: intro logo, comparsa allo scroll, header ---------- */
const io = "IntersectionObserver" in window
  ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 })
  : null;
function reveal() { $$("[data-reveal]:not(.in)").forEach((el) => (io ? io.observe(el) : el.classList.add("in"))); }
function initMotion() {
  const sp = $("#splash");
  setTimeout(() => sp?.remove(), 3300);
  sp?.addEventListener("click", () => sp.remove());
  addEventListener("scroll", () => {
    $(".top").classList.toggle("scrolled", scrollY > 8);
  }, { passive: true });
  $(".hero")?.addEventListener("pointermove", (e) => { // luce che segue il mouse
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
}

/* ---------- avvio ---------- */
async function init() {
  bindEvents(); initMotion();
  const { data: { session } } = await db.auth.getSession();
  await applySession(session);
  db.auth.onAuthStateChange((evt, s) => {
    if (evt === "INITIAL_SESSION") return;
    setTimeout(async () => { await applySession(s); route(); }, 0); // setTimeout evita blocchi nel callback Supabase
  });
  await loadServices();
  route();
  reveal();
  // ogni minuto: gli slot appena passati si disattivano e l'agenda si aggiorna
  setInterval(() => {
    const v = currentView(), b = state.book;
    if (v === "book" && b.service && b.date && (!b.time || isPast(b.date, b.time))) loadSlots();
    if (v === "agenda" && !$("dialog[open]")) renderAgenda();
  }, 60000);
}
init().catch((e) => { console.error(e); toast("Errore di avvio: controlla la configurazione in supabase.js"); });
