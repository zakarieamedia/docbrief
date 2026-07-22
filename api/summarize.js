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
// Hard ceiling regardless of what the client asks for. The final summarize
// call requests 6000 (structured fields + the fullSummary narrative), so this
// must stay above that.
const MAX_TOKENS_LIMIT = 8192

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
