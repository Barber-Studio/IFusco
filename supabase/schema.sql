-- IFUSCO · schema Supabase. Incolla tutto in: SQL Editor > New query > Run.

-- ========== TABELLE ==========
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text, cognome text,
  telefono text unique,
  ruolo text not null default 'customer' check (ruolo in ('customer','admin')),
  created_at timestamptz default now()
);

create table if not exists services (
  id bigint generated always as identity primary key,
  name text not null, description text,
  price numeric(8,2) not null default 0,
  duration_min int not null default 30 check (duration_min > 0),
  active boolean not null default true,
  sort int not null default 0
);

create table if not exists appointments (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete set null,   -- null = cliente occasionale
  client_name text,                                           -- usato se user_id e' null
  service_id bigint references services(id),
  appointment_date date not null,
  start_time time not null,
  duration_min int,                                           -- copiati dal servizio al momento della prenotazione
  price numeric(8,2),
  staff smallint not null default 1 check (staff in (1,2)),   -- collaboratore 1 o 2
  status text not null default 'confirmed' check (status in ('confirmed','completed','cancelled')),
  note text,
  created_at timestamptz default now()
);

create table if not exists availability_blocks (
  id bigint generated always as identity primary key,
  block_date date not null, block_time time not null,
  staff smallint not null check (staff in (1,2)),
  user_id uuid references profiles(id) on delete set null,    -- cliente associato (opzionale)
  note text,
  created_at timestamptz default now(),
  unique (block_date, block_time, staff)
);

create table if not exists notifications (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id) on delete cascade,
  title text, body text, read boolean default false,
  created_at timestamptz default now()
);

-- ========== FUNZIONI ==========
create or replace function is_admin() returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from profiles where id = auth.uid() and ruolo = 'admin') $$;

-- Crea il profilo alla registrazione (dati passati in options.data da app.js)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, nome, cognome, telefono)
  values (new.id, new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'cognome', new.raw_user_meta_data->>'telefono');
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- Un cliente non puo' promuovere se stesso ad admin
create or replace function protect_role() returns trigger language plpgsql as $$
begin
  if new.ruolo is distinct from old.ruolo and auth.uid() is not null and not is_admin() then new.ruolo := old.ruolo; end if;
  return new;
end $$;
drop trigger if exists profiles_protect_role on profiles;
create trigger profiles_protect_role before update on profiles for each row execute function protect_role();

-- Controlli lato server su ogni prenotazione: durata/prezzo dal servizio, giorni aperti,
-- no passato (clienti), nessuna sovrapposizione con altre prenotazioni o blocchi.
create or replace function appointments_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare e time; s services;
begin
  if tg_op = 'INSERT' or new.service_id is distinct from old.service_id then
    select * into s from services where id = new.service_id;
    if s.id is null then raise exception 'servizio_non_valido'; end if;
    new.duration_min := s.duration_min; new.price := s.price;
  end if;
  if new.status = 'cancelled' then return new; end if;
  if extract(dow from new.appointment_date) not in (2,3,4,5,6) then raise exception 'giorno_chiuso'; end if;
  if not is_admin() and ((new.appointment_date + new.start_time) at time zone 'Europe/Rome') < now() then
    raise exception 'orario_passato';
  end if;
  e := new.start_time + make_interval(mins => new.duration_min);
  if exists (select 1 from appointments a
             where a.id is distinct from new.id and a.appointment_date = new.appointment_date
               and a.staff = new.staff and a.status <> 'cancelled'
               and a.start_time < e and a.start_time + make_interval(mins => a.duration_min) > new.start_time)
     or exists (select 1 from availability_blocks b
             where b.block_date = new.appointment_date and b.staff = new.staff
               and b.block_time >= new.start_time and b.block_time < e) then
    raise exception 'slot_occupato';
  end if;
  return new;
end $$;
drop trigger if exists appointments_guard_t on appointments;
create trigger appointments_guard_t before insert or update on appointments for each row execute function appointments_guard();

-- Occupazione di un giorno visibile a tutti SENZA esporre dati dei clienti
create or replace function get_busy(p_date date)
returns table (staff smallint, start_time time, duration_min int, kind text)
language sql security definer stable set search_path = public as $$
  select a.staff, a.start_time, a.duration_min, 'appt'::text from appointments a
    where a.appointment_date = p_date and a.status <> 'cancelled'
  union all
  select b.staff, b.block_time, 30, 'block'::text from availability_blocks b where b.block_date = p_date
$$;
grant execute on function get_busy(date) to anon, authenticated;

-- Il cliente annulla solo le proprie prenotazioni future
create or replace function cancel_my_appointment(p_id bigint) returns void
language sql security definer set search_path = public as $$
  update appointments set status = 'cancelled'
  where id = p_id and user_id = auth.uid() and status = 'confirmed'
    and ((appointment_date + start_time) at time zone 'Europe/Rome') > now()
$$;
grant execute on function cancel_my_appointment(bigint) to authenticated;

-- ========== ROW LEVEL SECURITY ==========
alter table profiles enable row level security;
alter table services enable row level security;
alter table appointments enable row level security;
alter table availability_blocks enable row level security;
alter table notifications enable row level security;

create policy profiles_read   on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_update on profiles for update using (id = auth.uid() or is_admin());

create policy services_read  on services for select using (active or is_admin());
create policy services_admin on services for all using (is_admin()) with check (is_admin());

create policy appt_read_own   on appointments for select using (user_id = auth.uid());
create policy appt_insert_own on appointments for insert to authenticated
  with check (user_id = auth.uid() and status = 'confirmed');
create policy appt_admin      on appointments for all using (is_admin()) with check (is_admin());

create policy blocks_admin on availability_blocks for all using (is_admin()) with check (is_admin());

create policy notif_read_own on notifications for select using (user_id = auth.uid());
create policy notif_update_own on notifications for update using (user_id = auth.uid());
-- (le notifiche vengono scritte dalla Edge Function con service role)

-- ========== SERVIZI DI ESEMPIO (modificali dalla tabella services) ==========
insert into services (name, description, price, duration_min, sort) values
 ('Taglio capelli', 'Taglio a forbice o macchina, con rifinitura a rasoio.', 18, 30, 1),
 ('Sfumatura', 'Sfumatura alta, media o bassa, curata nei dettagli.', 20, 30, 2),
 ('Barba', 'Modellatura, panno caldo e rifinitura a rasoio.', 12, 30, 3),
 ('Taglio + barba', 'Il servizio completo in un unico appuntamento.', 28, 60, 4),
 ('Rasatura classica', 'Rasatura a rasoio con panno caldo e olio pre-barba.', 18, 30, 5),
 ('Taglio ragazzo', 'Fino a 14 anni.', 14, 30, 6),
 ('Shampoo e styling', 'Lavaggio, massaggio e messa in piega.', 10, 30, 7),
 ('Colore', 'Copertura dei capelli bianchi o colore, consulenza inclusa.', 25, 60, 8),
 ('Pulizia viso', 'Detersione, scrub e maschera per una pelle curata.', 15, 30, 9);

-- ========== DIVENTARE ADMIN ==========
-- Dopo esserti registrato dal sito con il tuo telefono, esegui:
-- update profiles set ruolo = 'admin' where telefono = '3331234567';
