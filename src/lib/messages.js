// Plain-English error translation. Nothing technical — no "JWT", no
// "row-level security", no raw API errors — should ever reach the screen.
//
// Errors we throw ourselves with `friendlyError()` are already plain and pass
// through untouched. Everything else is pattern-matched to a human sentence;
// unknown errors get a generic wrapper that keeps the technical detail
// visible (so a screenshot from the user still tells the admin what broke).

export function friendlyError(message) {
  const e = new Error(message)
  e.friendly = true
  return e
}

const BUSY = 'The service is busy right now. Please wait a minute and try again.'

export function humanizeError(raw, context = 'general') {
  if (raw?.friendly) return raw.message
  const msg = String(raw?.message ?? raw ?? '').trim()
  const m = msg.toLowerCase()

  // Document exceeds the model's context window
  if (/prompt is too long|too many tokens|context window|maximum context|exceeds? the maximum/.test(m)) {
    return context === 'chat'
      ? 'This document is too long for follow-up questions. The summary tabs still cover the whole document.'
      : 'This document is too long to analyze in one pass. Try a shorter document, or split it into parts.'
  }

  if (/credit balance|billing hard limit|payment required|\b402\b/.test(m)) {
    return 'The analysis service is out of credit. (Admin: top up the Anthropic account.)'
  }

  if (/rate.?limit|too many requests|\b429\b|overloaded|\b529\b/.test(m)) return BUSY

  if (/failed to fetch|networkerror|network request|load failed|fetch failed|econnrefused/.test(m)) {
    return 'Couldn’t reach the server. Check your internet connection and try again.'
  }

  if (/server is missing/.test(m)) {
    return 'The server isn’t fully set up. (Admin: a server environment variable is missing.)'
  }

  if (/jwt|token is expired|invalid token|refresh_token|unauthorized|\b401\b|session.*expired/.test(m)) {
    return 'Your session has timed out. Please log out and log back in.'
  }

  if (/row.?level security|violates.*policy|permission denied|\b403\b/.test(m)) {
    return 'A permissions problem stopped this. Log out and back in, then try again — if it keeps happening, the app’s database setup needs attention.'
  }

  if (
    (context === 'save' || context === 'history') &&
    /bucket.*not.*found|object not found|resource was not found|not_found/.test(m)
  ) {
    return 'The document storage area couldn’t be reached, so the document text wasn’t stored. Please try again.'
  }

  if (/claude api error \(5|internal server|api_error|\b500\b|\b502\b|\b503\b/.test(m)) {
    return 'Something went wrong on the analysis service. Please try again in a moment.'
  }

  if (context === 'auth') {
    if (/invalid login credentials/.test(m)) {
      return 'That email and password don’t match. Check both and try again.'
    }
    if (/signup.*(not allowed|disabled)|sign.?ups? are disabled/.test(m)) {
      return 'New accounts are by invitation only. Contact the administrator for access.'
    }
    if (/email not confirmed/.test(m)) {
      return 'This email hasn’t been confirmed yet. Check your inbox for the confirmation link.'
    }
  }

  return msg
    ? `Something unexpected went wrong. Details: ${msg}`
    : 'Something unexpected went wrong. Please try again.'
}

// Upload/extraction failures get their own vocabulary — the fix is always
// something the user does to the FILE, so say exactly what.
export function humanizeUploadError(raw) {
  if (raw?.friendly) return raw.message
  const msg = String(raw?.message ?? raw ?? '').trim()
  const m = msg.toLowerCase()

  if (raw?.name === 'PasswordException' || /password/.test(m)) {
    return 'This PDF is password-protected, so it can’t be read. Open it in your PDF app, save a copy without the password, and upload that instead.'
  }
  if (/invalid pdf|corrupt|bad xref|missing pdf|pdf structure/.test(m)) {
    return 'This file doesn’t appear to be a working PDF. Try re-downloading or re-saving it, then upload again.'
  }
  if (/could not find file in options|docx|central directory|zip/.test(m)) {
    return 'This Word file couldn’t be read. Open it in Word and save it again as .docx (or as a PDF), then upload that.'
  }
  if (/failed to fetch|network/.test(m)) {
    return 'Part of the PDF reader couldn’t load. Check your internet connection and try again.'
  }
  return msg
    ? `This file couldn’t be read. Details: ${msg}`
    : 'This file couldn’t be read. Please try a different copy of it.'
}
