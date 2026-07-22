import { useEffect, useRef, useState } from 'react'
import { askQuestion } from '../lib/claude'
import Markdown from './Markdown'
import PagePointer from './PagePointer'

// A follow-up Q&A panel that appears under the summary. Every question replays
// the full conversation to Claude, grounded in the extracted document text, and
// gets back a conversational answer plus a citation pointing into the source.
export default function DocChat({ documentText, documentPages }) {
  // Each message is { role, content }. Assistant messages also carry `citation`.
  const [messages, setMessages] = useState([])
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
      const { answer, citation } = await askQuestion(
        question,
        documentText,
        history,
        documentPages,
      )
      setMessages((prev) => [...prev, { role: 'assistant', content: answer, citation }])
    } catch (err) {
      setError(err.message || 'Could not get an answer. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hair border-t-4 border-t-navy bg-surface shadow-sm">
      {/* Header */}
      <div className="bg-navy px-4 py-3">
        <h3 className="font-serif text-base font-bold text-white">
          Ask a question about this document
        </h3>
        <p className="mt-0.5 text-xs text-white/70">
          Answers come only from the document you uploaded, with a pointer to where to verify.
        </p>
      </div>

      {/* Scrollable message history */}
      <div ref={scrollRef} className="max-h-[400px] space-y-3 overflow-y-auto bg-paper px-4 py-4">
        {messages.length === 0 && !loading && (
          <p className="py-6 text-center text-sm text-faint">
            No questions yet — ask something like &ldquo;What are the key deadlines?&rdquo;
          </p>
        )}

        {messages.map((msg, i) =>
          msg.role === 'user' ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-navy px-3.5 py-2 text-sm leading-relaxed text-white">
                {msg.content}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div className="max-w-[88%] break-words rounded-2xl rounded-bl-sm border border-hair bg-surface px-3.5 py-2.5 text-ink">
                <Markdown className="text-sm leading-relaxed [&_p]:mb-2 [&_:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4">
                  {msg.content}
                </Markdown>
                {msg.citation && <PagePointer citation={msg.citation} className="mt-2" />}
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-hair bg-surface px-3.5 py-2.5">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-navy/40 [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-navy/40 [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-navy/40" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-risk-high/25 bg-risk-high/[0.08] px-3.5 py-2 text-sm text-risk-high-ink">
              {error}
            </div>
          </div>
        )}
      </div>

      {/* Input bar pinned to the bottom of the panel */}
      <form onSubmit={handleSend} className="flex gap-2 border-t border-hair bg-surface p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={documentText ? 'Ask a question…' : 'Document text unavailable'}
          disabled={loading || !documentText}
          className="flex-1 rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink placeholder-faint focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-lg bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
