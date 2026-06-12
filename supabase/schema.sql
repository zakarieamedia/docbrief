create table summaries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  user_email text,
  file_name text,
  file_type text,
  word_count int,
  depth text,
  format text,
  focus text,
  summary_text text,
  chunks_processed int,
  actual_cost numeric,
  created_at timestamp default now()
);
alter table summaries enable row level security;
create policy "Users see own summaries" on summaries
  for all using (auth.uid() = user_id);

-- Admin dashboard access. Keep this email in sync with VITE_ADMIN_EMAIL
-- in .env.local — RLS is what actually enforces admin access; the client
-- env var only controls UI visibility.
create policy "Admin reads all summaries" on summaries
  for select using ((auth.jwt() ->> 'email') = 'zakarie.amedia07@gmail.com');
create policy "Admin deletes any summary" on summaries
  for delete using ((auth.jwt() ->> 'email') = 'zakarie.amedia07@gmail.com');

-- Migration for databases created before user_email / chunks_processed /
-- actual_cost:
--   alter table summaries add column user_email text;
--   alter table summaries add column chunks_processed int;
--   alter table summaries add column actual_cost numeric;
--   (then run the two admin policies above)
