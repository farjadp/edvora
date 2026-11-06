import { toPersianDigits as fa } from '@edvora/core/digits'
import { cx } from '@edvora/ui'
import { quiz } from '../_lib/data'
import type { OptionId } from '../_lib/options'
import { Emblem, Icon, Ring } from './art'
import { Page, ctaClass, disp, secondaryClass } from './kit'

function Figure({ option, pct, correct, total, tone }: { option: OptionId; pct: number; correct: number; total: number; tone: 'pass' | 'notyet' }) {
  if (option === 'block') {
    return (
      <p className={cx(disp, 'text-8xl font-black leading-[0.85] tabular-nums')}>
        {fa(correct)}
        <span className="text-5xl">/{fa(total)}</span>
      </p>
    )
  }
  return (
    <Ring option={option} value={pct} label={`${fa(pct)} درصد`} className="size-28">
      <span className={cx(disp, 'text-2xl font-black', tone === 'pass' ? '' : '')}>{fa(pct)}٪</span>
    </Ring>
  )
}

function Result({ option, state }: { option: OptionId; state: 'pass' | 'notyet' }) {
  const pass = state === 'pass'
  const r = pass ? quiz.pass : quiz.fail
  const block = option === 'block'
  const shell = block
    ? cx('e-wipe rounded-2xl p-6 md:p-8', pass ? 'bg-ok text-bg' : 'bg-ink text-bg')
    : cx(
        'e-rise p-6 md:p-8',
        option === 'seal' ? 'rounded-md border border-line bg-surface' : 'rounded-2xl border border-line bg-[var(--e-tint)]',
      )
  const subtle = block ? 'font-medium' : 'text-muted'
  return (
    <section role="status" aria-live="polite" aria-atomic="true" aria-labelledby={`h-${state}`} className={shell}>
      <p className={cx('text-sm font-bold', !block && 'text-muted')}>{quiz.title}</p>
      <div className="mt-4 flex items-center gap-5">
        <Figure option={option} pct={r.pct} correct={r.correct} total={r.total} tone={state} />
        <div className="min-w-0">
          <h2 id={`h-${state}`} tabIndex={-1} className={cx(disp, 'flex items-center gap-2 text-2xl font-black leading-9 md:text-3xl')}>
            <Icon name={pass ? 'check' : 'half'} option={option} className={cx('size-7', !block && (pass ? 'text-ok' : 'text-brand'))} />
            {pass ? 'قبول شدید' : 'هنوز به حد نصاب نرسیده‌اید'}
          </h2>
          <p className="mt-1 font-bold">
            {fa(r.correct)} از {fa(r.total)} درست · {fa(r.pct)}٪
          </p>
          <p className={cx('text-sm', subtle)}>{pass ? `حد نصاب قبولی: ${fa(quiz.passMark)}٪` : `برای قبولی ${fa(quiz.passMark)}٪ لازم است`}</p>
        </div>
      </div>

      <hr className={cx('my-5', block ? 'border-bg/40' : 'border-line')} />

      {pass ? (
        <p className="leading-8">{quiz.pass.strength}</p>
      ) : (
        <div>
          <p className="font-bold">بیشتر در «{quiz.fail.weak}» کمک می‌کند</p>
          <ul className="mt-2">
            {quiz.fail.lessons.map((l) => (
              <li key={l}>
                <a href="#lesson" className="flex min-h-11 items-center justify-between gap-3 underline-offset-4 hover:underline">
                  <span>{l}</span>
                  <Icon name="chevron" option={option} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3">
        {pass ? (
          <>
            <a href="#next" className={block ? cx(ctaClass(option, 'on-brand')) : ctaClass(option)}>
              <span>ادامه: جلسهٔ ۱۴</span>
              <Icon name="chevron" option={option} />
            </a>
            <a href="#review" className={cx(secondaryClass(option), block && 'border-bg')}>مرور پاسخ‌ها</a>
          </>
        ) : (
          <>
            <a href="#lessons" className={block ? cx(ctaClass(option, 'on-brand')) : ctaClass(option)}>مرور درس‌های مربوط</a>
            <button
              type="button"
              disabled
              aria-describedby="cooldown"
              className={cx(secondaryClass(option), 'cursor-not-allowed opacity-70', block && 'border-bg')}
            >
              آزمون دوباره
            </button>
            <p id="cooldown" className={cx('text-sm', subtle)}>
              امکان آزمون دوباره {fa(12)} ساعت دیگر باز می‌شود. شمار تلاش: {fa(quiz.fail.attempt)} از {fa(quiz.fail.maxAttempts)}
            </p>
          </>
        )}
      </div>

      {pass ? (
        <p className={cx('mt-5 flex items-center gap-3 border-t pt-4 text-sm', block ? 'border-bg/40' : 'border-line')}>
          {block ? <Icon name="book" option={option} className="size-6" /> : <Emblem option={option} icon="book" className="size-9" label="نشان تحلیل‌گر" />}
          <span>
            {fa(30)} امتیاز · نشان «تحلیل‌گر»
          </span>
        </p>
      ) : null}
    </section>
  )
}

export function Quiz({ option }: { option: OptionId }) {
  return (
    <Page>
      <h1 className="sr-only">نتیجهٔ آزمون (دو حالت)</h1>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="mx-auto w-full max-w-xl min-w-0">
          <p className="mb-3 text-sm font-bold text-muted">حالت قبول</p>
          <Result option={option} state="pass" />
        </div>
        <div className="mx-auto w-full max-w-xl min-w-0">
          <p className="mb-3 text-sm font-bold text-muted">حالت هنوز نرسیده‌اید (بدون هیچ عنصر پاداش و بدون قرمز)</p>
          <Result option={option} state="notyet" />
        </div>
      </div>
    </Page>
  )
}
