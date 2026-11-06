/**
 * Cleans Persian text copied from elsewhere (old websites, Word files) to Edvora's orthography rules:
 *  - Arabic ي/ك/ى → Persian ی/ک
 *  - stretched letters (کشیده «ـ») removed
 *  - half-spaces (ZWNJ) for می/نمی, ها/های, تر/ترین and ‌ای/‌ام after a final «ه»
 *  - Latin digits in Persian prose → Persian digits; digits inside Latin words, URLs and emails stay Latin
 *  - «،» used as a thousands separator between digits → «٬»
 *  - whitespace collapsed and trimmed
 *  - a right-to-left mark after «)» that closes Latin text, so «(Brand MBA)» doesn't render flipped
 *
 * Conservative on purpose: it never rewrites words, only spacing, letters and digits.
 */
import { toPersianDigits } from './digits'

const ZWNJ = '‌'
const PERSIAN_LETTER = 'ء-يپچژکگیآ'
const END = `(?=$|[\\s.,،؛:!?؟»)\\]"'…\\-])`

/** Tokens that must keep Latin digits: URLs, emails, and any word that contains a Latin letter (B2B, MBA-181). */
const KEEP_LATIN = /(https?:\/\/\S+|www\.\S+|[\w.+-]+@[\w-]+\.[\w.-]+|[A-Za-z0-9_-]*[A-Za-z][A-Za-z0-9_-]*)/g

function persianDigitsInProse(text: string): string {
  let out = ''
  let last = 0
  for (const m of text.matchAll(KEEP_LATIN)) {
    out += toPersianDigits(text.slice(last, m.index)) + m[0]
    last = (m.index ?? 0) + m[0].length
  }
  return out + toPersianDigits(text.slice(last))
}

export function cleanPersianText(input: string | null | undefined): string {
  if (!input) return ''
  let t = input
    .replace(/ي/g, 'ی')
    .replace(/ى/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ـ/g, '')
    .replace(/[   ]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')

  // Half-spaces. A plain space or a stray ZWNJ+space both become a single ZWNJ.
  t = t
    .replace(new RegExp(`(^|[\\s(«])(ن?می)[ ${ZWNJ}]+(?=[${PERSIAN_LETTER}])`, 'g'), `$1$2${ZWNJ}`)
    .replace(new RegExp(`([${PERSIAN_LETTER}])[ ${ZWNJ}]+(ها|های|هایی|هایم|هایت|هایش|هایمان|هایتان|هایشان)${END}`, 'g'), `$1${ZWNJ}$2`)
    .replace(new RegExp(`([${PERSIAN_LETTER}])[ ${ZWNJ}]+(تر|ترین|تری|ترها)${END}`, 'g'), `$1${ZWNJ}$2`)
    .replace(new RegExp(`(ه)[ ${ZWNJ}]+(ای|ایی|ام|ات|اش|اید|ایم)${END}`, 'g'), `$1${ZWNJ}$2`)
    .replace(new RegExp(`${ZWNJ}+`, 'g'), ZWNJ)
    .replace(new RegExp(`${ZWNJ}(?=[\\s.,،؛:!?؟]|$)|(?<=\\s)${ZWNJ}`, 'g'), '')

  // Thousands separators written with an Arabic comma: 35،770،000 → 35٬770٬000.
  t = t.replace(/(?<=[0-9۰-۹])[،,](?=[0-9۰-۹]{3}(?![0-9۰-۹]))/g, '٬')

  // Bidi: a ")" right after Latin text (e.g. «برند (Brand MBA)») otherwise takes the Latin direction and the
  // parentheses render flipped in RTL. A right-to-left mark after it anchors it to the Persian text.
  t = t.replace(/(?<=[A-Za-z0-9.])\)(?!\u200f)/g, ')\u200f')

  return persianDigitsInProse(t).trim()
}

/** For single-line fields (titles, names): also folds newlines into spaces. */
export function cleanPersianLine(input: string | null | undefined): string {
  return cleanPersianText(input).replace(/\s*\n\s*/g, ' ')
}
