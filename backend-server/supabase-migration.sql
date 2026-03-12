-- ============================================================
-- TeleDesk – Supabase PostgreSQL Schema
-- Run this in the Supabase SQL editor (Project → SQL Editor)
-- ============================================================

-- Enable UUID extension (already enabled in Supabase by default)
create extension if not exists "uuid-ossp";

-- ─── users ────────────────────────────────────────────────────────────────
create table if not exists public.users (
  uid                 text        primary key,
  name                text        not null default '',
  username            text        unique,
  email               text        not null default '',
  avatar              text        not null default '',
  created_at          text        not null,
  last_seen           text        not null,
  online_status       text        not null default 'offline',   -- 'online' | 'offline' | 'away'
  show_active_status  boolean     not null default true,
  show_message_status boolean     not null default true,
  pinned_chat_ids     text[]      not null default '{}',
  archived_chat_ids   text[]      not null default '{}',
  nicknames           jsonb       not null default '{}'
);

-- Index for username lookups
create index if not exists users_username_idx on public.users (username);

-- ─── chats ────────────────────────────────────────────────────────────────
create table if not exists public.chats (
  chat_id             text        primary key,
  type                text        not null,   -- 'private' | 'group'
  members             text[]      not null default '{}',
  created_at          text        not null,
  last_message        jsonb,                  -- Message object snapshot
  last_message_at     text,
  pinned_message_ids  text[]      not null default '{}'
);

create index if not exists chats_members_idx on public.chats using gin (members);

-- ─── messages ─────────────────────────────────────────────────────────────
create table if not exists public.messages (
  message_id          text        primary key,
  chat_id             text        not null references public.chats(chat_id) on delete cascade,
  sender_id           text        not null,
  sender_name         text,
  sender_avatar       text,
  content             text        not null default '',
  type                text        not null default 'text',
  timestamp           text        not null,
  read_by             text[]      not null default '{}',
  file_url            text,
  file_name           text,
  file_size           bigint,
  encrypted           boolean     default false,
  deleted             boolean     default false,
  deleted_for         text[]      not null default '{}',
  is_edited           boolean     default false,
  forwarded           boolean     default false,
  reply_to            jsonb,
  call_type           text,
  call_duration       integer,
  call_status         text,
  call_status_receiver text
);

create index if not exists messages_chat_id_idx     on public.messages (chat_id);
create index if not exists messages_timestamp_idx   on public.messages (chat_id, timestamp);

-- ─── groups ───────────────────────────────────────────────────────────────
create table if not exists public.groups (
  group_id    text        primary key,
  name        text        not null,
  avatar      text        not null default '',
  members     text[]      not null default '{}',
  admins      text[]      not null default '{}',
  created_at  text        not null,
  description text        not null default ''
);

-- ─── Row-Level Security (RLS) ─────────────────────────────────────────────
-- The backend uses the service-role key so RLS is bypassed.
-- If you ever access Supabase directly from the client, enable RLS policies below.
-- alter table public.users   enable row level security;
-- alter table public.chats   enable row level security;
-- alter table public.messages enable row level security;
-- alter table public.groups  enable row level security;

-- ─── saved_messages (Saved Messages / Bookmarks) ───────────────────────────
-- Stores per-user saved messages as jsonb so it can evolve with the client.
create table if not exists public.saved_messages (
  uid         text    not null,
  message_id  text    not null,
  entry       jsonb   not null,
  created_at  text    not null,
  updated_at  text    not null,
  primary key (uid, message_id)
);

create index if not exists saved_messages_uid_idx on public.saved_messages (uid);
create index if not exists saved_messages_updated_at_idx on public.saved_messages (uid, updated_at);

-- ─── Migrations (run if table already exists without these columns) ─────────
-- Add columns first (without constraints)
alter table public.users add column if not exists nicknames jsonb not null default '{}';
alter table public.users add column if not exists show_message_status boolean not null default true;
alter table public.users add column if not exists username text;
alter table public.messages add column if not exists delivered_to text[] not null default '{}';

-- Add unique constraint separately (only if it doesn't exist)
do $$ 
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'users_username_key' 
    and conrelid = 'public.users'::regclass
  ) then
    alter table public.users add constraint users_username_key unique (username);
  end if;
exception
  when duplicate_table then
    -- Constraint already exists, ignore
    null;
end $$;

-- Create index
create index if not exists users_username_idx on public.users (username);
alter table public.messages add column if not exists delivered_to text[] not null default '{}';

-- ─── Message Reactions ────────────────────────────────────────────────────────
-- Stores per-message reactions as { "emoji": ["uid1", "uid2", ...] }
alter table public.messages add column if not exists reactions jsonb not null default '{}';

-- ─── Message Groups (Telegram-style grid layout) ─────────────────────────
-- Groups multiple files uploaded together so they render as a single message bubble grid
alter table public.messages add column if not exists group_id text;
