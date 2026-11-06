import { describe, expect, it } from 'vitest'
import { cleanPersianLine, cleanPersianText } from './persian'

const Z = '‌'

describe('cleanPersianText', () => {
  it('replaces Arabic letters and removes kashida', () => {
    expect(cleanPersianText('برندســــازي كاربردي')).toBe('برندسازی کاربردی')
  })

  it('adds half-spaces for می/نمی, ها/های, تر/ترین and ‌ای after ه', () => {
    expect(cleanPersianText('می شود')).toBe(`می${Z}شود`)
    expect(cleanPersianText('نمی توانند')).toBe(`نمی${Z}توانند`)
    expect(cleanPersianText('دوره های برندسازی')).toBe(`دوره${Z}های برندسازی`)
    expect(cleanPersianText('استراتژی های هوشمندانه تری')).toBe(`استراتژی${Z}های هوشمندانه${Z}تری`)
    expect(cleanPersianText('برنامه ای ۴ ماهه')).toBe(`برنامه${Z}ای ۴ ماهه`)
  })

  it('does not join words that only look like suffixes', () => {
    expect(cleanPersianText('این دوره هر سال')).toBe('این دوره هر سال')
    expect(cleanPersianText('میزان تراکم')).toBe('میزان تراکم')
  })

  it('turns Latin digits in prose into Persian digits but keeps codes, URLs and emails Latin', () => {
    expect(cleanPersianText('بیش از 26 سال تجربه')).toBe('بیش از ۲۶ سال تجربه')
    expect(cleanPersianText('تکنیک های فروش B2B')).toBe(`تکنیک${Z}های فروش B2B`)
    expect(cleanPersianText('info@IranBrandAcademy.com و 22277111')).toBe('info@IranBrandAcademy.com و ۲۲۲۷۷۱۱۱')
    expect(cleanPersianText('https://example.com/a1 ثبت')).toBe('https://example.com/a1 ثبت')
  })

  it('uses the Persian thousands separator', () => {
    expect(cleanPersianText('35،770،000 تومان')).toBe('۳۵٬۷۷۰٬۰۰۰ تومان')
    expect(cleanPersianText('سال ۱۴۰۵، ۲۰ نفر')).toBe('سال ۱۴۰۵، ۲۰ نفر')
  })

  it('collapses whitespace, drops stray half-spaces and handles empty input', () => {
    expect(cleanPersianText(`  سلام   دنیا${Z} \n\n\n\nخط`)).toBe('سلام دنیا\n\nخط')
    expect(cleanPersianText(null)).toBe('')
  })
})

describe('cleanPersianLine', () => {
  it('folds newlines', () => {
    expect(cleanPersianLine('دکتر\n شهریار شفیعی')).toBe('دکتر شهریار شفیعی')
  })
})
