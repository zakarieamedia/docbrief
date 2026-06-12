# DocBrief

Professional document summarizer for legal, financial, real estate, and business documents. Upload a PDF, DOCX, TXT, CSV, or MD file, choose a summary depth and format, and get a Claude-generated summary you can export as a PDF or save to your history.

## Stack

- **Vite + React + Tailwind CSS** — frontend
- **Supabase** — auth, database (summary history), row-level security
- **Anthropic Claude API** (`claude-sonnet-4-6`) — chunked summarization
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
   VITE_ANTHROPIC_API_KEY=your_key_here
   VITE_SUPABASE_URL=your_url_here
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

4. **Run**

   ```sh
   npm run dev
   ```

## Security note

This app calls the Anthropic API directly from the browser (`anthropic-dangerous-direct-browser-access`), which exposes the API key to anyone using the deployed site. That is acceptable for local/personal use; before a public deployment, move the Claude call behind a server route (e.g. a Vercel serverless function) and keep the key server-side.

## Deployment

`vercel.json` includes an SPA rewrite so client-side routing works on Vercel. Set the three environment variables in your Vercel project settings.
