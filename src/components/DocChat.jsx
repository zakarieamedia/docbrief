import { useEffect, useRef, useState } from 'react'
import { askQuestion } from '../lib/claude'
import Markdown from './Markdown'

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
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-800 px-3.5 py-2 break-words">
                <Markdown className="text-sm leading-relaxed [&_p]:mb-2 [&_:last-child]:mb-0 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:mb-2">
                  {msg.content}
                </Markdown>
                {msg.citation && (
                  <p className="mt-1.5 text-xs text-gray-500">Source: {msg.citation}</p>
                )}
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
