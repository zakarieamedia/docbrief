create table summaries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  file_name text,
  file_type text,
  word_count int,
  depth text,
  format text,
  focus text,
  summary_text text,
  created_at timestamp default now()
);
alter table summaries enable row level security;
create policy "Users see own summaries" on summaries
  for all using (auth.uid() = user_id);
