import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseCsv, parseDocument, tableToText } from './parse'

const docx = (paragraphs: string[]) =>
  zipSync({ 'word/document.xml': strToU8(`<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`) })

const xlsx = () =>
  zipSync({
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="دوره‌ها" sheetId="1"/></sheets></workbook>'),
    'xl/sharedStrings.xml': strToU8('<sst><si><t>عنوان</t></si><si><t>شهریه</t></si><si><t>برندسازی</t></si></sst>'),
    'xl/worksheets/sheet1.xml': strToU8('<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>450000000</v></c></row></sheetData></worksheet>'),
  })

describe('knowledge-base parsing', () => {
  it('reads Word paragraphs and decodes entities', async () => {
    const r = await parseDocument('rules.docx', docx(['سیاست بازپرداخت', 'تا ۱۴ روز &amp; بدون جریمه']))
    expect(r).toMatchObject({ ok: true, kind: 'docx' })
    expect(r.ok && r.text).toBe('سیاست بازپرداخت\n\nتا ۱۴ روز & بدون جریمه')
  })

  it('reads Excel rows as "header: value" lines with the sheet name', async () => {
    const r = await parseDocument('courses.xlsx', xlsx())
    expect(r.ok && r.text).toBe('دوره‌ها\nعنوان: برندسازی · شهریه: 450000000')
  })

  it('reads CSV with quotes, commas and newlines inside cells', () => {
    expect(parseCsv('a,b\n"x, y","line1\nline2"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'line1\nline2'],
    ])
    expect(tableToText([['نام', 'وضعیت'], ['علی', 'فعال']])).toBe('نام: علی · وضعیت: فعال')
  })

  it('reads a PDF', async () => {
    const pdf = new Uint8Array(readFileSync(join(__dirname, '../../../../../e2e/fixtures/ai-refund-policy.pdf')))
    const r = await parseDocument('policy.pdf', pdf)
    expect(r.ok && r.text).toContain('refundable within 14 days')
  })

  it('refuses empty, unsupported, legacy and broken files without throwing', async () => {
    expect(await parseDocument('a.txt', new Uint8Array())).toMatchObject({ ok: false })
    expect(await parseDocument('a.exe', strToU8('x'))).toMatchObject({ ok: false })
    expect(await parseDocument('a.doc', strToU8('x'))).toMatchObject({ ok: false, error: expect.stringContaining('docx') })
    expect(await parseDocument('a.docx', strToU8('not a zip'))).toMatchObject({ ok: false })
  })
})
