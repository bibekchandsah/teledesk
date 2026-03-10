-- ============================================================
-- Device Sessions Migration
-- Add device session tracking for multi-device logout
-- ============================================================

-- ─── device_sessions ──────────────────────────────────────────────────────
create table if not exists public.device_sessions (
  session_id          text        primary key default gen_random_uuid()::text,
  uid                 text        not null references public.users(uid) on delete cascade,
  device_name         text        not null,           -- Browser/OS info
  device_type         text        not null,           -- 'desktop', 'mobile', 'web'
  ip_address          text        not null,
  location_country    text,                           -- From IP geolocation
  location_city       text,                           -- From IP geolocation
  location_region     text,                           -- From IP geolocation
  user_agent          text        not null,
  firebase_token_id   text        not null,           -- Firebase token identifier
  created_at          text        not null,
  last_active         text        not null,
  is_current          boolean     not null default false  -- Mark current session
);

-- Indexes for efficient queries
create index if not exists device_sessions_uid_idx on public.device_sessions (uid);
create index if not exists device_sessions_token_idx on public.device_sessions (firebase_token_id);
create index if not exists device_sessions_last_active_idx on public.device_sessions (last_active);

-- ─── Cleanup old sessions (optional trigger) ──────────────────────────────
-- Auto-delete sessions older than 30 days
create or replace function cleanup_old_sessions()
returns trigger as $$
begin
  delete from public.device_sessions 
  where extract(epoch from now()) - extract(epoch from to_timestamp(last_active, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) > 2592000; -- 30 days
  return null;
end;
$$ language plpgsql;

-- Trigger to run cleanup on insert (when new session is created)
drop trigger if exists cleanup_sessions_trigger on public.device_sessions;
create trigger cleanup_sessions_trigger
  after insert on public.device_sessions
  execute function cleanup_old_sessions();