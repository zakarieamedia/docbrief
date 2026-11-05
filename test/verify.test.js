import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeForMatch,
  quoteAppearsIn,
  sourceAppearsIn,
  locateQuotePage,
  verifySummaryAgainstText,
} from '../src/lib/verify.js'

const doc = normalizeForMatch(`
  RECITALS. The parties wish to lease the Premises.
  Section 4.2 Conditional Approval. Landlord’s consent shall not be unreasonably withheld.
  Section 6.3 Operating Expenses. Tenant shall pay Tenant’s Proportionate Share of all
  Operating Expenses without limitation.
  Exhibit D — Guaranty of Lease.
`)

test('normalizeForMatch folds smart quotes, dashes, whitespace and case', () => {
  assert.equal(normalizeForMatch('  “Tenant’s”  Share — Exhibit\nD '), `"tenant's" share - exhibit d`)
  assert.equal(normalizeForMatch(null), '')
})

test('quoteAppearsIn requires the exact wording (after normalization)', () => {
  assert.equal(quoteAppearsIn('Tenant shall pay Tenant’s Proportionate Share', doc), true)
  assert.equal(quoteAppearsIn('TENANT SHALL PAY   tenant\'s proportionate share', doc), true)
  // A paraphrase is not a quote.
  assert.equal(quoteAppearsIn('Tenant must pay its proportionate share', doc), false)
  assert.equal(quoteAppearsIn('', doc), false)
})

test('quoteAppearsIn checks every excerpt of an ellipsis-joined quote', () => {
  assert.equal(quoteAppearsIn('Tenant shall pay … without limitation', doc), true)
  assert.equal(quoteAppearsIn('Tenant shall pay ... with a cap of 5%', doc), false)
})

test('sourceAppearsIn accepts references that exist in the document', () => {
  assert.equal(sourceAppearsIn('Section 6.3', doc), true)
  assert.equal(sourceAppearsIn('Section 4.2(b)', doc), true) // falls back to the base "4.2"
  assert.equal(sourceAppearsIn('Exhibit D', doc), true)
  assert.equal(sourceAppearsIn('Recitals', doc), true)
})

test('sourceAppearsIn flags references that are clearly absent', () => {
  assert.equal(sourceAppearsIn('Section 99', doc), false)
  assert.equal(sourceAppearsIn('Schedule 7', doc), false)
  assert.equal(sourceAppearsIn('', doc), false)
})

test('locateQuotePage returns the single page holding the quote', () => {
  const pages = ['intro text', 'rent is due monthly', 'termination on notice'].map(normalizeForMatch)
  assert.equal(locateQuotePage('Rent is due monthly', pages), 2)
})

test('locateQuotePage refuses to guess when the quote is ambiguous or missing', () => {
  const pages = ['rent is due', 'rent is due', 'other'].map(normalizeForMatch)
  assert.equal(locateQuotePage('rent is due', pages), null)
  assert.equal(locateQuotePage('not in the document', pages), null)
  assert.equal(locateQuotePage('rent', []), null)
})

test('locateQuotePage handles a quote that straddles a page break', () => {
  const pages = ['the tenant shall', 'indemnify the landlord', 'end'].map(normalizeForMatch)
  assert.equal(locateQuotePage('the tenant shall indemnify the landlord', pages), 1)
})

test('verifySummaryAgainstText stamps verdicts and computes pages from real quotes', () => {
  const text = 'Page one intro. Tenant shall pay all Operating Expenses without limitation. Section 6.3.'
  const pages = ['Page one intro.', 'Tenant shall pay all Operating Expenses without limitation. Section 6.3.']
  const summary = {
    risksAndFlags: [
      { severity: 'high', source: 'Section 6.3', sourceQuote: 'Tenant shall pay all Operating Expenses' },
      { severity: 'low', source: 'Section 42', sourceQuote: 'a sentence the model invented' },
      { severity: 'low', description: 'no citation at all' },
    ],
    keyObligations: [{ obligation: 'Pay expenses', source: 'Section 6.3' }],
    importantDates: [],
  }
  const out = verifySummaryAgainstText(summary, text, pages)
  const [real, invented, uncited] = out.risksAndFlags

  assert.equal(real.quoteVerified, true)
  assert.equal(real.sourceVerified, true)
  assert.equal(real.sourcePage, 2)

  assert.equal(invented.quoteVerified, false)
  assert.equal(invented.sourceVerified, false)
  assert.equal(invented.sourcePage, undefined) // never pin a page for an unverified quote

  assert.equal(uncited.sourceVerified, undefined) // left unstamped, not marked "not found"
  assert.equal(out.keyObligations[0].sourceVerified, true)
})
