-- XSite Auto database: many shops in one database.
-- Safe to run again. scripts/setup-db.mjs runs this, then upgrades an older single-shop
-- database (the original Forks Auto Repair layout) and turns on row-level security.

-- The shop a database session is working for, and whether it is the system itself (signup, nightly jobs).
create or replace function app_shop() returns uuid language sql stable as
  $$ select nullif(current_setting('app.shop_id', true), '')::uuid $$;
create or replace function app_admin() returns boolean language sql stable as
  $$ select coalesce(current_setting('app.admin', true), '') = 'on' $$;

create table if not exists shops (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$'),
  name text not null,
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'read_only', 'closed')),
  trial_ends_at timestamptz,
  country text not null default 'US' check (country in ('US', 'CA')),
  region text,
  timezone text not null default 'America/New_York',
  phone text,
  website_url text,
  techs_band text,
  source text,
  slug_changed boolean not null default false,
  stripe_customer_id text,
  stripe_subscription_id text,
  setup_paid_at timestamptz,
  converted_at timestamptz,
  past_due_since timestamptz,
  read_only_since timestamptz,
  embed_seen_at timestamptz,
  embed_seen_url text,
  emails_sent jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Addresses that belong to one shop: its own public website ('site') or its own Shop Book address ('app').
create table if not exists shop_domains (
  host text primary key,
  shop_id uuid not null references shops on delete cascade,
  kind text not null check (kind in ('site', 'app'))
);

create table if not exists users (
  id serial primary key,
  email text unique not null,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now()
);
alter table users add column if not exists shop_id uuid references shops on delete cascade;
alter table users add column if not exists role text not null default 'owner';
alter table users add column if not exists email_verified_at timestamptz;
alter table users add column if not exists invited_by text;

-- A trial signup waiting for its email code. Nothing else exists until the code is entered.
create table if not exists signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  data jsonb not null,
  code_hash text not null,
  tries int not null default 0,
  ip_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists signups_email on signups (lower(email), created_at desc);
create index if not exists signups_ip on signups (ip_hash, created_at desc);

-- One-time links: password resets and team invites. Only a hash of the token is stored.
create table if not exists tokens (
  token_hash text primary key,
  kind text not null check (kind in ('reset', 'invite')),
  email text not null,
  shop_id uuid references shops on delete cascade,
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz
);

-- ---------- one shop's records (row-level security keeps each shop to its own) ----------
-- Each record is stored whole as JSON, keyed by the id the page gives it.
create table if not exists customers (shop_id uuid not null default app_shop() references shops on delete cascade, id text not null, data jsonb not null, updated_by text, updated_at timestamptz not null default now(), primary key (shop_id, id));
create table if not exists jobs      (shop_id uuid not null default app_shop() references shops on delete cascade, id text not null, data jsonb not null, updated_by text, updated_at timestamptz not null default now(), primary key (shop_id, id));
create table if not exists cash_days (shop_id uuid not null default app_shop() references shops on delete cascade, id text not null, data jsonb not null, updated_by text, updated_at timestamptz not null default now(), primary key (shop_id, id));
create table if not exists settings  (shop_id uuid not null default app_shop() references shops on delete cascade, id text not null, data jsonb not null, updated_by text, updated_at timestamptz not null default now(), primary key (shop_id, id));

-- Every save and delete is recorded here, so cash and payment changes can always be traced.
create table if not exists change_log (
  id bigserial primary key,
  shop_id uuid not null default app_shop() references shops on delete cascade,
  collection text not null,
  record_id text not null,
  action text not null,
  data jsonb,
  changed_by text,
  changed_at timestamptz not null default now()
);
create index if not exists change_log_record on change_log (collection, record_id, changed_at desc);

-- Photos for the public website, stored in the database so there's no separate storage account.
create table if not exists photos (
  id text primary key,
  shop_id uuid not null default app_shop() references shops on delete cascade,
  mime text not null,
  bytes bytea not null,
  uploaded_by text,
  uploaded_at timestamptz not null default now()
);

-- Check-in and booking requests sent by customers from the booking page.
create table if not exists requests (
  shop_id uuid not null default app_shop() references shops on delete cascade,
  id text not null,
  data jsonb not null,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (shop_id, id)
);
create index if not exists requests_created on requests (created_at desc);
create index if not exists requests_ip on requests (ip_hash, created_at desc);

-- Rate limiting for the returning-customer "what's missing" check (no customer data stored here).
create table if not exists lookups (
  id bigserial primary key,
  shop_id uuid not null default app_shop() references shops on delete cascade,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists lookups_ip on lookups (ip_hash, created_at desc);

-- QuickBooks (and other) customer imports, so a whole import can be undone.
create table if not exists imports (
  shop_id uuid not null default app_shop() references shops on delete cascade,
  id text not null,
  data jsonb not null,
  created_by text,
  created_at timestamptz not null default now(),
  primary key (shop_id, id)
);

-- Text appointment reminders: one per job per appointment date, with the customer's reply.
create table if not exists reminders (
  shop_id uuid not null default app_shop() references shops on delete cascade,
  job_id text not null,
  appt_date date not null,
  phone text not null,
  status text not null default 'sent' check (status in ('sent', 'confirmed', 'declined', 'replied', 'failed', 'optout')),
  body text,
  sid text,
  error text,
  reply text,
  sent_at timestamptz not null default now(),
  replied_at timestamptz,
  test boolean not null default false,
  primary key (shop_id, job_id, appt_date)
);
create index if not exists reminders_phone on reminders (phone, sent_at desc);

-- Phone numbers that texted STOP. Never texted again until they text START.
create table if not exists sms_optouts (
  phone text primary key,
  created_at timestamptz not null default now()
);
