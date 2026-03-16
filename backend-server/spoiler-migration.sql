-- ============================================================
-- TeleDesk – Image/Video Spoiler Feature Migration
-- Run this in the Supabase SQL editor (Project → SQL Editor)
-- ============================================================

-- Add is_spoiler column to messages table
-- This allows images and videos to be marked as spoilers with blur effect
alter table public.messages add column if not exists is_spoiler boolean default false;

-- Create index for faster queries on spoiler messages (optional, for analytics)
create index if not exists messages_is_spoiler_idx on public.messages (is_spoiler) where is_spoiler = true;
