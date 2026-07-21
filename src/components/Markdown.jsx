import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Single markdown renderer shared by the summary and Q&A paths so Claude's
// output (which may contain **bold**, headings, lists) renders as HTML instead
// of leaking raw # / ** symbols into the UI. Output is sanitized before it hits
// the DOM. `breaks: true` turns single newlines into <br>, which reads better
// for short conversational answers.
export default function Markdown({ children, className = '' }) {
  const source = String(children ?? '')
  const html = DOMPurify.sanitize(marked.parse(source, { breaks: true, gfm: true }))
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
