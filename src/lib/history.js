import { supabase } from './supabase'

/**
 * Persist a completed analysis to history: the extracted document text
 * (+ per-page array for PDFs) goes to the private `documents` Storage bucket
 * as JSON, then the summary row is inserted with only the storage path.
 * Returns the storage path (null when there was no text to store).
 *
 * Called automatically when an analysis finishes; a failure here surfaces as
 * a retryable warning in the results view — never a silent loss.
 */
export async function saveAnalysisToHistory({ session, result, documentText, documentPages }) {
  let documentPath = null
  if (documentText) {
    documentPath = `${session.user.id}/${crypto.randomUUID?.() ?? Date.now()}.json`
    const payload = new Blob(
      [JSON.stringify({ text: documentText, pages: documentPages ?? null })],
      { type: 'application/json' },
    )
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(documentPath, payload, { contentType: 'application/json' })
    if (uploadError) {
      throw new Error(`Could not store the document text for Q&A: ${uploadError.message}`)
    }
  }

  const { error } = await supabase.from('summaries').insert({
    user_id: session.user.id,
    user_email: session.user.email,
    file_name: result.fileName,
    file_type: result.fileType,
    word_count: result.wordCount,
    depth: result.depth,
    format: result.format,
    focus: result.focus || null,
    summary_text:
      typeof result.summary === 'string' ? result.summary : JSON.stringify(result.summary),
    chunks_processed: result.chunksProcessed ?? null,
    actual_cost: result.actualCost ?? null,
    document_path: documentPath,
  })
  if (error) throw error
  return documentPath
}
