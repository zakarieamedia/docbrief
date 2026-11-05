import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatPageList,
  detectScannedPages,
  detectTablePages,
  buildExtractionWarnings,
} from '../src/lib/extractionChecks.js'

const textPage = { chars: 2400, digits: 40, items: 120, avgItemLen: 20 }
const blankPage = { chars: 12, digits: 0, items: 2, avgItemLen: 6 }
const tablePage = { chars: 900, digits: 400, items: 220, avgItemLen: 4 }

test('formatPageList compresses consecutive runs', () => {
  assert.equal(formatPageList([12, 3, 8, 7, 9]), '3, 7–9, 12')
  assert.equal(formatPageList([]), '')
})

test('formatPageList caps long lists with "and N more"', () => {
  assert.equal(formatPageList([1, 3, 5, 7], 2), '1, 3 and 2 more')
})

test('detectScannedPages warns when a meaningful share of pages has no text', () => {
  const res = detectScannedPages([textPage, blankPage, textPage, blankPage, textPage])
  assert.deepEqual(res, { pages: [2, 4], warn: true })
})

test('detectScannedPages ignores a single stray blank page', () => {
  const stats = [blankPage, ...Array(9).fill(textPage)]
  assert.equal(detectScannedPages(stats).warn, false)
})

test('detectTablePages spots dense, fragmented, digit-heavy pages', () => {
  assert.deepEqual(detectTablePages([textPage, tablePage]), { pages: [2], warn: true })
  assert.equal(detectTablePages([textPage, textPage]).warn, false)
})

test('buildExtractionWarnings returns user-facing warnings, or none', () => {
  assert.deepEqual(buildExtractionWarnings([]), [])
  assert.deepEqual(buildExtractionWarnings(null), [])
  const warnings = buildExtractionWarnings([textPage, blankPage, tablePage, blankPage, textPage])
  assert.deepEqual(warnings.map((w) => w.type), ['scanned', 'tables'])
  assert.match(warnings[1].message, /Page 3 appears to contain tables/)
})
