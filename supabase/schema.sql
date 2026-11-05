create table summaries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  user_email text,
  file_name text,
  file_type text,
  word_count int,
  depth text,
  format text, -- legacy: the Output Format control was removed 2026-07; new rows leave this null
  focus text,
  summary_text text,
  chunks_processed int,
  actual_cost numeric,
  created_at timestamp default now()
);
alter table summaries enable row level security;
create policy "Users see own summaries" on summaries
  for all using (auth.uid() = user_id);

-- Admin dashboard access. Replace admin@example.com with your admin account's
-- email and keep it in sync with VITE_ADMIN_EMAIL in .env.local — RLS is what actually enforces admin access; the client
-- env var only controls UI visibility.
create policy "Admin reads all summaries" on summaries
  for select using ((auth.jwt() ->> 'email') = 'admin@example.com');
create policy "Admin deletes any summary" on summaries
  for delete using ((auth.jwt() ->> 'email') = 'admin@example.com');

-- Migration for databases created before user_email / chunks_processed /
-- actual_cost:
--   alter table summaries add column user_email text;
--   alter table summaries add column chunks_processed int;
--   alter table summaries add column actual_cost numeric;
--   (then run the two admin policies above)

-- ── Document text persistence (Q&A on reopened summaries) ──────────────────
-- The extracted document text (+ per-page array for PDFs) is stored as JSON
-- in the PRIVATE storage bucket `documents`, under <user_id>/<uuid>.json.
-- The summaries row keeps only the path:
alter table summaries add column if not exists document_path text;

-- Create the bucket in Dashboard -> Storage -> New bucket, name `documents`,
-- with "Public bucket" OFF. Then run these storage policies (RLS is already
-- enabled on storage.objects). Each keys on the first path segment being the
-- caller's own user id:
create policy "Users upload own documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users read own documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users delete own documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = auth.uid()::text);
