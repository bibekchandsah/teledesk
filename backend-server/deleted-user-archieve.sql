create table if not exists deleted_users (
  id uuid default gen_random_uuid() primary key,
  uid text not null,
  email text,
  name text,
  username text,
  original_created_at timestamptz,
  deleted_at timestamptz default now()
);
