# DocBrief — Project Context

> Paste this into a Claude project file to give future sessions full context on DocBrief.
> **Snapshot date:** 2026-07-20 · **Repo:** `zabagency/docbrief` · **Branch:** `main` · **HEAD:** `7bf668b`

---

## 1. What DocBrief is

DocBrief is a web app that turns long documents (contracts, agreements, reports, statements) into a **structured executive brief** using Claude, and then lets the user **ask follow-up questions** about the same document.

**Core flow:**
1. User signs in (Supabase email auth).
2. User uploads a document — **PDF, DOCX, TXT, CSV, or MD**. Text is extracted **client-side** (`pdfjs-dist` for PDF, `mammoth` for DOCX, `FileReader` for the rest).
3. User picks analysis settings and confirms in a modal (which shows a token-based cost estimate).
4. The extracted text is summarized via Claude. Large docs are split into 150k-char chunks and processed **map-reduce**: each chunk → key bullets, then a consolidation call → one structured JSON summary.
5. The summary renders as a structured brief: **document title/type/date, parties, financial terms, key obligations, important dates, risks & flags (high/medium/low), and an overview.**
6. User can **download the brief as a styled PDF** (`jspdf`), **copy** it, or **save it to history** (Supabase `summaries` table).
7. Below the summary, a **DocChat** panel lets the user ask follow-up questions grounded strictly in the uploaded document.

**Key design points:**
- The **Anthropic API key never reaches the browser.** All Claude calls go through a Vercel serverless proxy (`api/summarize.js`) that requires a valid Supabase session.
- **Two models by task:** summarization uses **`claude-sonnet-4-6`**; document Q&A uses **`claude-haiku-4-5`** (cheaper, sufficient). The proxy enforces a **model allowlist** so a client can't request an arbitrary/expensive model.
- The last summary result persists across refreshes via `localStorage` (`docbrief:lastResult`), cleared on logout.
- An **admin** view exists, gated by matching the signed-in email against `VITE_ADMIN_EMAIL`.

---

## 2. Tech stack

| Layer | Tech |
|---|---|
| Build/tooling | **Vite 7** (`@vitejs/plugin-react`) |
| UI | **React 19**, **React Router 7** (`react-router-dom`) |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`, CSS-based `@theme`; custom `navy` / `navy-dark` / `navy-light` / `navy-pale` colors) |
| Auth + DB | **Supabase** (`@supabase/supabase-js`) — email auth + Postgres `summaries` history table |
| LLM | **Claude API** (Anthropic Messages API) via a **Vercel serverless proxy** |
| Hosting | **Vercel** (static SPA + `/api/*` serverless functions; see `vercel.json`) |
| Doc parsing | `pdfjs-dist` (PDF), `mammoth` (DOCX), `FileReader` (TXT/CSV/MD) |
| Output | `jspdf` (PDF export), `marked` + `dompurify` (legacy markdown summaries) |
| Module type | ESM (`"type": "module"` in `package.json`) |

**Package name/version:** `docbrief` `0.1.0`. **Scripts:** `dev` (vite), `build` (vite build), `preview` (vite preview).

**File map (key files):**
```
api/summarize.js              # Vercel serverless proxy to Claude (auth + model allowlist)
src/lib/supabase.js           # Browser Supabase client (anon key)
src/lib/claude.js             # summarizeDocument(), askQuestion(), cost estimation
src/App.jsx                   # Routing, auth/session state, orchestration
src/components/
  Auth.jsx                    # Sign-in screen
  Uploader.jsx                # Drag/drop + text extraction
  SummaryControls.jsx         # Depth/format/focus controls, "Analyze" trigger
  ConfirmModal.jsx            # Cost-estimate confirmation before spending
  ResultView.jsx              # Structured summary render, PDF/copy/save
  DocChat.jsx                 # Follow-up Q&A chat panel
  History.jsx                 # Saved summaries list
src/pages/Admin.jsx           # Admin-only page
vercel.json                   # SPA rewrites + /api passthrough
```

---

## 3. Deployment status & the JWT auth bug

**Deployment target:** Vercel. `vercel.json` rewrites route `/api/*` to serverless functions and everything else to the SPA (`index.html`). The frontend is a static Vite build; `/api/summarize` is the only backend.

**The JWT auth bug (fixed in code, needs env config):**
- **Original approach:** `api/summarize.js` verified the Supabase access token *locally* using `jsonwebtoken` against a symmetric `SUPABASE_JWT_SECRET` (HS256).
- **The bug:** Newer Supabase projects sign JWTs with **ECC (asymmetric) keys** and **no longer expose a symmetric `SUPABASE_JWT_SECRET`**. Local verification therefore failed, and authenticated users got **401 Unauthorized** on every summarize/chat request.
- **The fix (commit `7bf668b`, pushed to `main`):** Replaced local JWT verification with a **Supabase service-role admin client** that calls **`supabase.auth.getUser(token)`** — Supabase itself validates the token and returns the user. Invalid/missing token → 401; verified → proceed.

**⚠️ Outstanding action required (not a code bug — an environment/config task):**
The fix depends on two server env vars that must be set wherever the function runs:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Until these are set in **Vercel** (Production/Preview) and in local `.env.local`, `/api/summarize` returns **500 “Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.”** The old `SUPABASE_JWT_SECRET` is no longer read and should be removed. **As of this snapshot, `.env.local` still lists the stale `SUPABASE_JWT_SECRET` and is missing the two new vars** — update it before running `vercel dev`.

---

## 4. Environment variables

### Client (build-time, `VITE_` prefix — bundled into the browser, safe to expose)
| Var | Purpose | Where to find it |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL used by the browser client | Supabase Dashboard → Project Settings → API → **Project URL** |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/public key | Supabase Dashboard → Project Settings → API → **Project API keys → `anon` `public`** |
| `VITE_ADMIN_EMAIL` | Email that unlocks the Admin nav/route | Your choice (the account you want to treat as admin) |

### Server (serverless runtime — **secret, never exposed to the browser**)
| Var | Purpose | Where to find it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API key for the proxy | console.anthropic.com → **API Keys** |
| `SUPABASE_URL` | Supabase project URL (server copy, no `VITE_` prefix) | Same as `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | **Service-role** key — used to verify caller tokens via `getUser()` | Supabase Dashboard → Project Settings → API → **Project API keys → `service_role`** (⚠️ full-access secret) |
| ~~`SUPABASE_JWT_SECRET`~~ | **Deprecated — no longer used.** Safe to delete. | — |

**Where to set them:**
- **Local dev:** `.env.local` at the repo root. Note: `VITE_*` vars are read by `vite dev`, but the **server vars only apply to the serverless function** — plain `vite dev` serves the frontend only. To exercise `/api/summarize` locally use **`vercel dev`** (or test against a deployed Vercel preview).
- **Production:** Vercel → Project → **Settings → Environment Variables** (set all six; do not set the deprecated JWT secret).

---

## 5. Recent git log (last 10 commits)

```
7bf668b  2026-07-20  fix: verify auth via Supabase getUser instead of a local JWT secret
2315840  2026-07-20  feat: use Haiku for Q&A and allowlist models in the proxy
7a4e15d  2026-07-20  feat: add document Q&A chat below the summary
03be653  2026-06-12  feat: require Supabase auth on the /api/summarize proxy
50c8e3b  2026-06-12  feat: proxy Claude calls through a Vercel serverless function
430d7c2  2026-06-12  fix: resolve all 8 confirmed pre-deployment audit findings
e6084c2  2026-06-12  feat: token-based cost estimates and actual cost tracking
3f4f9be  2026-06-12  feat: persist last summary result across refreshes
78e0522  2026-06-12  feat: uncapped document size, confirmation modal for all users
bc35e9b  2026-06-12  feat: admin-only confirmation modal, raise analysis limits
```

---

## 6. Known issues & next steps

1. **Set the new server env vars** (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) in Vercel and `.env.local`, and **remove `SUPABASE_JWT_SECRET`**. This is the last step to make the auth fix live. (See §3.)
2. **`jsonwebtoken` is now an unused dependency** — `npm uninstall jsonwebtoken` when convenient.
3. **Q&A cost isn’t tracked.** The cost constants in `src/lib/claude.js` (`INPUT_COST_PER_TOKEN` / `OUTPUT_COST_PER_TOKEN`) are **Sonnet-priced** and used only for the summary estimate/actual-cost. DocChat (Haiku) usage isn’t recorded. If adding chat cost tracking, Haiku is **$1 / MTok input, $5 / MTok output**.
4. **DocChat needs the live document text.** The uploaded text lives only in React `doc` state (not persisted). Opening a summary **from history** or **after a page refresh** shows the chat panel in a disabled “Document text unavailable” state — it only works right after a fresh analysis. A future improvement could persist the extracted text (or re-extract) to enable chat on saved summaries.
5. **Model allowlist must stay in sync.** `src/lib/claude.js` (`SUMMARY_MODEL`, `CHAT_MODEL`) and `api/summarize.js` (`ALLOWED_MODELS`, `DEFAULT_MODEL`) both list the models — update both when changing models.
6. **Supabase `summaries` table** must exist with columns referenced by `ResultView.jsx` / `History.jsx`: `user_id`, `user_email`, `file_name`, `file_type`, `word_count`, `depth`, `format`, `focus`, `summary_text`, `chunks_processed`, `actual_cost`. (Schema not included in this doc; it lives in Supabase.)

### Structured summary shape (produced by `summarizeDocument`, consumed by `ResultView`)
```json
{
  "documentTitle": "string",
  "documentType": "string",
  "preparedDate": "string",
  "parties":         [{ "name": "string", "role": "string" }],
  "financialTerms":  [{ "item": "string", "amount": "string", "notes": "string" }],
  "keyObligations":  [{ "party": "string", "obligation": "string", "deadline": "string" }],
  "importantDates":  [{ "date": "string", "event": "string" }],
  "risksAndFlags":   [{ "severity": "high|medium|low", "description": "string" }],
  "overview": "string"
}
```

---

## 7. `api/summarize.js` (full contents)

```js
// Vercel serverless function — keeps ANTHROPIC_API_KEY server-side.
// The client (src/lib/claude.js) posts { messages, system, max_tokens }
// with a Supabase access token; only authenticated users can spend credits.
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 30

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
// The client picks a model per task (Sonnet for summaries, Haiku for Q&A), but
// the server only ever forwards a model on this allowlist — an untrusted client
// can't point the proxy at an arbitrary (and arbitrarily expensive) model.
const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5']
const DEFAULT_MODEL = 'claude-sonnet-4-6'
// Hard ceiling regardless of what the client asks for.
const MAX_TOKENS_LIMIT = 4096

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: { message: 'Method not allowed.' } })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: { message: 'Server is missing ANTHROPIC_API_KEY.' } })
  }

  // Verify the caller with Supabase directly rather than validating a JWT
  // locally — projects created with ECC signing keys no longer expose a
  // symmetric SUPABASE_JWT_SECRET to verify against.
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return res
      .status(500)
      .json({ error: { message: 'Server is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' } })
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return res.status(401).json({ error: { message: 'Unauthorized' } })
  }

  // Admin client authenticated with the service role key; getUser(token)
  // asks Supabase to validate the caller's access token and return the user.
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  if (userError || !userData?.user) {
    return res.status(401).json({ error: { message: 'Unauthorized' } })
  }

  const { messages, system, max_tokens, model } = req.body ?? {}
  if (!Array.isArray(messages) || messages.length === 0) {
    return res
      .status(400)
      .json({ error: { message: 'Request body must include a non-empty "messages" array.' } })
  }

  // Fall back to the default when the client omits a model, but reject anything
  // outside the allowlist rather than forwarding it to Anthropic.
  const selectedModel = model ?? DEFAULT_MODEL
  if (!ALLOWED_MODELS.includes(selectedModel)) {
    return res
      .status(400)
      .json({ error: { message: `Unsupported model "${selectedModel}".` } })
  }

  try {
    const response = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: Math.min(Number(max_tokens) || 2000, MAX_TOKENS_LIMIT),
        system,
        messages,
      }),
    })
    const data = await response.json()
    return res.status(response.status).json(data)
  } catch {
    return res.status(502).json({ error: { message: 'Could not reach the Anthropic API.' } })
  }
}
```

---

## 8. `src/lib/claude.js` (full contents)

```js
import { supabase } from './supabase'

// Claude calls go through the serverless proxy (api/summarize.js) so the
// Anthropic API key never reaches the browser. The proxy only accepts requests
// from authenticated Supabase users, and only for models on its allowlist.
const API_URL = '/api/summarize'

// Model per task. Summarization needs Sonnet's depth; document Q&A is well
// within Haiku's reach at a fraction of the cost. The proxy validates these
// against its own allowlist — keep the two lists in sync.
const SUMMARY_MODEL = 'claude-sonnet-4-6'
const CHAT_MODEL = 'claude-haiku-4-5'

const MAX_TOKENS = 2000
// The structured JSON summary needs headroom beyond the per-chunk limit —
// a response cut off at max_tokens is unparseable JSON.
const FINAL_MAX_TOKENS = 3000
const CHUNK_SIZE = 150000

// Sonnet pricing: $3 / MTok input, $15 / MTok output.
export const INPUT_COST_PER_TOKEN = 0.000003
export const OUTPUT_COST_PER_TOKEN = 0.000015

// Rough blended cost of one API call — used only for history rows saved
// before actual costs were recorded.
export const COST_PER_CALL = 0.015

/**
 * Predict what summarizeDocument will do with this text, without calling
 * the API: chunk count, and estimated cost. Input tokens ≈ chars / 4;
 * output is bounded by MAX_TOKENS per call (one call per chunk plus a
 * consolidation call when there are multiple chunks).
 */
export function estimateAnalysis(text) {
  const chunks = Math.max(Math.ceil(text.length / CHUNK_SIZE), 1)
  const calls = chunks > 1 ? chunks + 1 : 1
  const inputTokens = text.length / 4
  const cost =
    inputTokens * INPUT_COST_PER_TOKEN + calls * MAX_TOKENS * OUTPUT_COST_PER_TOKEN
  return {
    chunks,
    estimatedCost: Math.round(cost * 1000) / 1000,
  }
}

const CHUNK_SYSTEM_PROMPT =
  'You are an expert document analyst. Extract ONLY the most critical information ' +
  'from this chunk in 3-4 bullet points maximum. Focus exclusively on: parties and ' +
  'their roles, key obligations, dollar amounts, dates, deadlines, and risks. Be ' +
  'extremely concise. No boilerplate, no obvious statements, no lengthy explanations.'

const FINAL_SYSTEM_PROMPT =
  'You are an expert document analyst. Respond with ONLY a single valid JSON object — ' +
  'no markdown, no code fences, no commentary. Use exactly this shape:\n' +
  '{\n' +
  '  "documentTitle": string,\n' +
  '  "documentType": string,\n' +
  '  "preparedDate": string,\n' +
  '  "parties": [{ "name": string, "role": string }],\n' +
  '  "financialTerms": [{ "item": string, "amount": string, "notes": string }],\n' +
  '  "keyObligations": [{ "party": string, "obligation": string, "deadline": string }],\n' +
  '  "importantDates": [{ "date": string, "event": string }],\n' +
  '  "risksAndFlags": [{ "severity": "high" | "medium" | "low", "description": string }],\n' +
  '  "overview": string\n' +
  '}\n' +
  'The overview is 2-3 sentences maximum. Maximum 4 entries per array — keep only what ' +
  'is decision-critical. Use "Not specified" when the document does not state something. ' +
  'Never invent facts that are not present in the source.'

// The model is instructed to return bare JSON, but defensively strip any
// surrounding prose/code fences by slicing to the outermost braces.
function parseSummary(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('The model did not return a structured summary. Please try again.')
  }
  let raw
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('Could not parse the structured summary. Please try again.')
  }
  const str = (v) => (typeof v === 'string' ? v : '')
  const arr = (v) => (Array.isArray(v) ? v : [])
  return {
    documentTitle: str(raw.documentTitle),
    documentType: str(raw.documentType),
    preparedDate: str(raw.preparedDate),
    parties: arr(raw.parties),
    financialTerms: arr(raw.financialTerms),
    keyObligations: arr(raw.keyObligations),
    importantDates: arr(raw.importantDates),
    risksAndFlags: arr(raw.risksAndFlags),
    overview: str(raw.overview),
  }
}

export function splitIntoChunks(text, size = CHUNK_SIZE) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

// Shared transport for every Claude call. Attaches the Supabase access token,
// posts { messages, system, max_tokens, model } to the proxy, and normalizes
// the response. Returns { text, usage, stopReason } — callers decide how to
// treat a "refusal" stop reason.
async function postToProxy(messages, system, maxTokens, model) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    throw new Error('Your session has expired. Please log in again.')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messages,
      system,
      max_tokens: maxTokens,
      model,
    }),
  })

  if (!response.ok) {
    let message = `Claude API error (${response.status})`
    try {
      const err = await response.json()
      if (err?.error?.message) message = err.error.message
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new Error(message)
  }

  const data = await response.json()
  return {
    text: data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n'),
    usage: data.usage,
    stopReason: data.stop_reason,
  }
}

async function callClaude(system, userContent, maxTokens = MAX_TOKENS) {
  const result = await postToProxy(
    [{ role: 'user', content: userContent }],
    system,
    maxTokens,
    SUMMARY_MODEL,
  )
  if (result.stopReason === 'refusal') {
    throw new Error('The model declined to summarize this content.')
  }
  return result
}

/**
 * Summarize a full document. The text is split into 150k-char chunks,
 * each chunk reduced to a few key bullets, then consolidated into one
 * structured summary object (see FINAL_SYSTEM_PROMPT for its shape).
 *
 * onProgress({ current, total, percent, stage }) fires before each API call.
 * Returns { summary, chunksProcessed, usage } where usage holds the summed
 * input/output tokens across all calls and the actual cost in dollars.
 */
export async function summarizeDocument(text, { focus }, onProgress) {
  const chunks = splitIntoChunks(text)
  const total = chunks.length
  const focusLine = focus?.trim()
    ? `Pay particular attention to the following focus areas: ${focus.trim()}.\n`
    : ''

  let inputTokens = 0
  let outputTokens = 0
  const track = (usage) => {
    inputTokens += usage?.input_tokens ?? 0
    outputTokens += usage?.output_tokens ?? 0
  }
  const totalUsage = () => ({
    inputTokens,
    outputTokens,
    actualCost:
      Math.round(
        (inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN) * 1e6,
      ) / 1e6,
  })

  // Single-chunk documents skip the map-reduce pass — summarize the full text
  // directly into the final structured format.
  if (total === 1) {
    onProgress?.({ current: 1, total: 1, percent: 0, stage: 'Summarizing document' })
    const { text: response, usage, stopReason } = await callClaude(
      FINAL_SYSTEM_PROMPT,
      `${focusLine}Summarize this document:\n\n${chunks[0]}`,
      FINAL_MAX_TOKENS,
    )
    track(usage)
    if (stopReason === 'max_tokens') {
      throw new Error('The summary exceeded the response limit and was cut off. Please try again.')
    }
    onProgress?.({ current: 1, total: 1, percent: 100, stage: 'Done' })
    return { summary: parseSummary(response), chunksProcessed: 1, usage: totalUsage() }
  }

  const chunkSummaries = []
  for (let i = 0; i < total; i++) {
    onProgress?.({
      current: i + 1,
      total,
      percent: Math.round((i / total) * 100),
      stage: `Analyzing chunk ${i + 1} of ${total}`,
    })
    const { text: summary, usage } = await callClaude(
      CHUNK_SYSTEM_PROMPT,
      `${focusLine}This is part ${i + 1} of ${total} of a larger document:\n\n${chunks[i]}`,
    )
    track(usage)
    chunkSummaries.push(summary)
  }

  onProgress?.({
    current: total,
    total,
    percent: 95,
    stage: 'Consolidating final summary',
  })
  const { text: response, usage, stopReason } = await callClaude(
    FINAL_SYSTEM_PROMPT,
    `Below are ${total} partial summaries of consecutive sections of one document. ` +
      `Merge them into a single final summary.\n${focusLine}\n` +
      chunkSummaries.map((s, i) => `--- Part ${i + 1} ---\n${s}`).join('\n\n'),
    FINAL_MAX_TOKENS,
  )
  track(usage)
  if (stopReason === 'max_tokens') {
    throw new Error('The summary exceeded the response limit and was cut off. Please try again.')
  }

  onProgress?.({ current: total, total, percent: 100, stage: 'Done' })
  return { summary: parseSummary(response), chunksProcessed: total, usage: totalUsage() }
}

const CHAT_SYSTEM_PROMPT =
  'You are a document assistant. The user has uploaded a document and wants to ask ' +
  'questions about it. Answer questions accurately and specifically using only the ' +
  'document content provided. If the answer is not in the document, say so clearly. ' +
  'Quote relevant sections when helpful. Be concise and direct.'

const CHAT_MAX_TOKENS = 1000

/**
 * Answer a follow-up question about the document. The whole conversation is
 * replayed to Claude each turn, with the document text attached as context to
 * the first user message so every answer stays grounded in the source.
 *
 * conversationHistory is the prior turns as [{ role, content }] (excluding the
 * new question, which is appended here). Returns { text, usage }.
 */
export async function askQuestion(question, documentText, conversationHistory = []) {
  const history = conversationHistory.map((m) => ({ role: m.role, content: m.content }))
  const messages = [...history, { role: 'user', content: question }]

  // The document rides along on the first user message only — replaying it on
  // every turn would waste tokens and blow past the context window.
  const firstUserIdx = messages.findIndex((m) => m.role === 'user')
  if (firstUserIdx !== -1) {
    messages[firstUserIdx] = {
      role: 'user',
      content:
        'Here is the document to answer questions about:\n\n' +
        `<document>\n${documentText}\n</document>\n\n` +
        `Question: ${messages[firstUserIdx].content}`,
    }
  }

  const { text, usage, stopReason } = await postToProxy(
    messages,
    CHAT_SYSTEM_PROMPT,
    CHAT_MAX_TOKENS,
    CHAT_MODEL,
  )
  if (stopReason === 'refusal') {
    throw new Error('The model declined to answer that question.')
  }
  return { text, usage }
}
```

---

## 9. `src/App.jsx` (full contents)

```jsx
import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { summarizeDocument, estimateAnalysis } from './lib/claude'
import Auth from './components/Auth'
import Uploader from './components/Uploader'
import SummaryControls from './components/SummaryControls'
import ConfirmModal from './components/ConfirmModal'
import ResultView from './components/ResultView'
import DocChat from './components/DocChat'
import History from './components/History'
import Admin from './pages/Admin'

// The last summary result — including file name and analysis metadata —
// survives refreshes and tab navigation. Cleared on logout.
const STORAGE_KEY = 'docbrief:lastResult'

function loadStoredResult() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)

  const [doc, setDoc] = useState(null) // { name, size, type, text, wordCount }
  const [progress, setProgress] = useState(null) // { current, total, percent, stage }
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(loadStoredResult) // { summary, wordCount, chunksProcessed, depth, format, focus, fileName, fileType }
  const [historyVersion, setHistoryVersion] = useState(0)
  // Analyze settings awaiting user confirmation in the modal; null = no modal.
  const [pendingAnalysis, setPendingAnalysis] = useState(null) // { depth, format, focus }

  // Reset everything tied to the signed-in user — covers every sign-out
  // path (button, expiry, another tab) so the next user on this browser
  // sees none of the previous user's document, summary, or pending modal.
  const clearUserState = () => {
    localStorage.removeItem(STORAGE_KEY)
    setResult(null)
    setDoc(null)
    setError('')
    setProgress(null)
    setPendingAnalysis(null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) clearUserState()
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    try {
      if (result) localStorage.setItem(STORAGE_KEY, JSON.stringify(result))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // storage full or unavailable — persistence is best-effort
    }
  }, [result])

  const isAdmin =
    Boolean(session) && session.user.email === import.meta.env.VITE_ADMIN_EMAIL

  // API calls start only after the user confirms in the modal.
  const handleAnalyzeRequest = (settings) => {
    if (!doc || processing) return
    setPendingAnalysis(settings)
  }

  const runAnalysis = async ({ depth, format, focus }) => {
    if (!doc || processing) return
    setProcessing(true)
    setError('')
    setResult(null)
    try {
      const { summary, chunksProcessed, usage } = await summarizeDocument(
        doc.text,
        { depth, format, focus },
        setProgress,
      )
      setResult({
        id: crypto.randomUUID?.() ?? String(Math.random()),
        summary,
        wordCount: doc.wordCount,
        chunksProcessed,
        actualCost: usage?.actualCost ?? null,
        depth,
        format,
        focus,
        fileName: doc.name,
        fileType: doc.type,
      })
    } catch (err) {
      setError(err.message || 'Summarization failed.')
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  const handleConfirmAnalysis = () => {
    const settings = pendingAnalysis
    setPendingAnalysis(null)
    runAnalysis(settings)
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-navy border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) return <Auth />

  const home = (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
      <aside className="order-2 lg:order-1">
        <History
          session={session}
          version={historyVersion}
          onSelect={(row) => {
            setResult({
              id: row.id,
              summary: row.summary_text,
              wordCount: row.word_count,
              chunksProcessed: row.chunks_processed,
              actualCost: row.actual_cost != null ? Number(row.actual_cost) : null,
              depth: row.depth,
              format: row.format,
              focus: row.focus,
              fileName: row.file_name,
              fileType: row.file_type,
              saved: true,
            })
            setError('')
          }}
          onDelete={(id) => {
            // The deleted row may be the summary currently on screen —
            // clearing result also removes it from localStorage.
            setResult((prev) => (prev && prev.id === id ? null : prev))
          }}
        />
      </aside>

      <section className="order-1 lg:order-2 space-y-6">
        <Uploader doc={doc} onExtracted={setDoc} disabled={processing} />
        <SummaryControls
          fileLoaded={Boolean(doc)}
          processing={processing}
          onAnalyze={handleAnalyzeRequest}
        />

        {processing && progress && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">{progress.stage}</span>
              <span className="text-sm text-gray-500">{progress.percent}%</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-navy rounded-full transition-all duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Chunk {progress.current} of {progress.total}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {result && (
          <ResultView
            // Remount per result so internal state (e.g. `saved`) resets when
            // a history row replaces a fresh analysis on screen.
            key={result.id ?? 'rehydrated'}
            result={result}
            session={session}
            onSaved={() => setHistoryVersion((v) => v + 1)}
          />
        )}

        {/* Follow-up Q&A grounded in the uploaded document. The document text
            lives only in `doc` (not persisted), so results rehydrated from
            history or a refresh render the panel in its unavailable state. */}
        {result && <DocChat documentText={doc?.text} />}
      </section>
    </main>
  )

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        {/* Navbar */}
        <header className="bg-navy text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center">
                <span className="font-bold">D</span>
              </div>
              <span className="text-xl font-bold tracking-tight">DocBrief</span>
            </Link>
            <div className="flex items-center gap-4">
              {isAdmin && (
                <Link
                  to="/admin"
                  className="text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
                >
                  Admin
                </Link>
              )}
              <span className="hidden sm:block text-sm text-white/80">{session.user.email}</span>
              <button
                onClick={() => {
                  clearUserState()
                  supabase.auth.signOut()
                }}
                className="text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg px-3 py-1.5 transition-colors"
              >
                Log out
              </button>
            </div>
          </div>
        </header>

        <Routes>
          <Route path="/" element={home} />
          <Route
            path="/admin"
            element={isAdmin ? <Admin /> : <Navigate to="/" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        {pendingAnalysis && doc && (
          <ConfirmModal
            doc={doc}
            estimate={estimateAnalysis(doc.text)}
            onConfirm={handleConfirmAnalysis}
            onCancel={() => setPendingAnalysis(null)}
          />
        )}
      </div>
    </BrowserRouter>
  )
}
```

---

## 10. `src/components/DocChat.jsx` (full contents)

```jsx
import { useEffect, useRef, useState } from 'react'
import { askQuestion } from '../lib/claude'

// A follow-up Q&A panel that appears under the summary. Every question replays
// the full conversation to Claude, grounded in the extracted document text.
export default function DocChat({ documentText }) {
  const [messages, setMessages] = useState([]) // [{ role: 'user' | 'assistant', content }]
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef(null)

  // A new document invalidates the previous conversation entirely.
  useEffect(() => {
    setMessages([])
    setInput('')
    setError('')
  }, [documentText])

  // Keep the newest message (or the thinking indicator) in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  const canSend = Boolean(documentText) && input.trim() && !loading

  const handleSend = async (e) => {
    e?.preventDefault()
    const question = input.trim()
    if (!question || loading || !documentText) return

    // Snapshot the prior turns before appending — askQuestion adds the new
    // question itself, so it must receive history without it.
    const history = messages
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    setInput('')
    setError('')
    setLoading(true)
    try {
      const { text } = await askQuestion(question, documentText, history)
      setMessages((prev) => [...prev, { role: 'assistant', content: text }])
    } catch (err) {
      setError(err.message || 'Could not get an answer. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden border-t-4 border-t-navy">
      {/* Header */}
      <div className="bg-navy px-4 py-3">
        <h3 className="text-white text-sm font-semibold">Ask a question about this document</h3>
        <p className="text-white/70 text-xs mt-0.5">
          Answers come only from the document you uploaded.
        </p>
      </div>

      {/* Scrollable message history */}
      <div
        ref={scrollRef}
        className="max-h-[400px] overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50"
      >
        {messages.length === 0 && !loading && (
          <p className="text-sm text-gray-500 text-center py-6">
            No questions yet — ask something like &ldquo;What are the key deadlines?&rdquo;
          </p>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-navy text-white text-sm leading-relaxed px-3.5 py-2 whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800 text-sm leading-relaxed px-3.5 py-2 whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-3.5 py-2.5">
              <span className="flex gap-1">
                <span className="h-2 w-2 rounded-full bg-navy/40 animate-bounce [animation-delay:-0.3s]" />
                <span className="h-2 w-2 rounded-full bg-navy/40 animate-bounce [animation-delay:-0.15s]" />
                <span className="h-2 w-2 rounded-full bg-navy/40 animate-bounce" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-red-50 border border-red-200 text-red-700 text-sm px-3.5 py-2">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Input bar pinned to the bottom of the panel */}
      <form onSubmit={handleSend} className="border-t border-gray-200 bg-white p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={documentText ? 'Ask a question…' : 'Document text unavailable'}
          disabled={loading || !documentText}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 disabled:opacity-60 disabled:cursor-not-allowed"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-lg bg-navy hover:bg-navy-dark text-white text-sm font-medium px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Send
        </button>
      </form>
    </div>
  )
}
```
