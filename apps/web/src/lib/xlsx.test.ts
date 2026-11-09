import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildXlsx, columnName, sheetName } from './xlsx'

describe('xlsx writer (E-023)', () => {
  it('column names', () => {
    expect([0, 25, 26, 27, 51, 52, 701, 702].map(columnName)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA'])
  })

  it('sheet names are legal and unique', () => {
    expect(sheetName('a/b:c', new Set())).toBe('a b c')
    expect(sheetName('x'.repeat(40), new Set())).toHaveLength(31)
    expect(sheetName('Pay', new Set(['pay']))).toBe('Pay 2')
  })

  it('writes a valid package: parts, RTL, frozen bold header, numbers as numbers, text never as formula', () => {
    const bytes = buildXlsx([
      { name: 'پرداخت‌ها', rtl: true, columns: [{ header: 'شماره' }, { header: 'مبلغ (تومان)' }, { header: 'یادداشت' }], rows: [[12, 4_000_000, '=HYPERLINK("x") & <b>\u0007']], },
      { name: 'اقساط', columns: [{ header: 'a' }], rows: [] },
    ])
    expect(bytes[0]).toBe(0x50) // PK
    const files = unzipSync(bytes)
    expect(Object.keys(files).sort()).toEqual(
      ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml'].sort(),
    )
    const wb = strFromU8(files['xl/workbook.xml']!)
    expect(wb).toContain('<sheet name="پرداخت‌ها" sheetId="1" r:id="rId1"/>')
    const s1 = strFromU8(files['xl/worksheets/sheet1.xml']!)
    expect(s1).toContain('rightToLeft="1"')
    expect(s1).toContain('state="frozen"')
    expect(s1).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">شماره</t></is></c>')
    expect(s1).toContain('<c r="B2"><v>4000000</v></c>')
    expect(s1).toContain('<t xml:space="preserve">=HYPERLINK(&quot;x&quot;) &amp; &lt;b&gt;</t>')
    expect(s1).not.toContain('<f>')
    expect(strFromU8(files['xl/worksheets/sheet2.xml']!)).not.toContain('rightToLeft')
  })

  it('is deterministic', () => {
    const s = [{ name: 'a', columns: [{ header: 'h' }], rows: [['x']] }]
    expect(Buffer.from(buildXlsx(s)).equals(Buffer.from(buildXlsx(s)))).toBe(true)
  })
})
