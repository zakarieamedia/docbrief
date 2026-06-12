# DocBrief

Professional document summarizer for legal, financial, real estate, and business documents. Upload a PDF, DOCX, TXT, CSV, or MD file, choose a summary depth and format, and get a Claude-generated summary you can export as a PDF or save to your history.

## Stack

- **Vite + React + Tailwind CSS** — frontend
- **Supabase** — auth, database (summary history), row-level security
- **Anthropic Claude API** (`claude-sonnet-4-6`) — chunked summarization, proxied
  through a Vercel serverless function (`api/summarize.js`) so the API key stays
  server-side
- **pdfjs-dist** — browser-side PDF text extraction
- **mammoth** — DOCX text extraction
- **jsPDF** — PDF export

## Setup

1. **Install dependencies**

   ```sh
   npm install
   ```

2. **Supabase**

   Create a project at [supabase.com](https://supabase.com), then run the SQL in `supabase/schema.sql` in the SQL editor. Enable email/password auth under Authentication → Providers.

3. **Environment variables**

   Fill in `.env.local`:

   ```
   # Server-side only (read by api/summarize.js via process.env — no VITE_ prefix,
   # so it is never bundled into the browser build)
   ANTHROPIC_API_KEY=your_key_here

   # Client-side (safe to expose: the anon key is protected by RLS)
   VITE_SUPABASE_URL=your_url_here
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   VITE_ADMIN_EMAIL=admin@example.com
   ```

4. **Run**

   ```sh
   vercel dev
   ```

   `vercel dev` runs the Vite frontend *and* the serverless function together.
   Plain `npm run dev` still works for UI-only changes, but `/api/summarize`
   will 404 there, so summarization requires `vercel dev`.

## Security note

Claude calls are proxied through `api/summarize.js`, which reads
`ANTHROPIC_API_KEY` from server-side environment variables — the key never
ships in the browser bundle. The endpoint pins the model and caps
`max_tokens` server-side. It is not authenticated, however: anyone who can
reach the deployed site can call it, so consider verifying the Supabase JWT
in the function before opening the app to untrusted users.

## Deployment

`vercel.json` rewrites `/api/*` to the serverless functions and everything
else to `index.html` so client-side routing works on Vercel. Set
`ANTHROPIC_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and
`VITE_ADMIN_EMAIL` in your Vercel project settings.
