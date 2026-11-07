import { cx } from './cx'
import { Icon } from './icons'

export type PathNodeState = 'done' | 'current' | 'todo' | 'sealed'

export type CertificatePathStep = {
  key: string
  label: string
  /** Short detail under the label, e.g. «۱۲ از ۳۰» (Persian digits, already formatted). */
  detail?: string
  state: PathNodeState
}

const SR: Record<PathNodeState, string> = { done: 'انجام شد', current: 'در جریان', todo: 'در انتظار', sealed: 'پس از تکمیل مراحل صادر می‌شود' }

function Node({ state }: { state: PathNodeState }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'relative z-10 grid size-9 place-items-center rounded-full',
        state === 'done' && 'bg-ink text-bg',
        state === 'current' && 'border-2 border-brand bg-surface text-brand',
        state === 'todo' && 'border border-line-strong bg-surface',
        state === 'sealed' && 'border border-dashed border-milestone bg-surface text-milestone',
      )}
    >
      {state === 'done' ? <Icon name="check" className="size-4" /> : null}
      {state === 'current' ? <Icon name="half" className="size-4" /> : null}
      {state === 'sealed' ? <Icon name="lock" className="size-4" /> : null}
    </span>
  )
}

/**
 * Horizontal stepper to the certificate: lessons · assignments · quizzes · defense · certificate. A stepper, not a card.
 * The last step is the gold one; XP never moves it.
 */
export function CertificatePath({ steps, remaining, className }: { steps: readonly CertificatePathStep[]; remaining?: string | null; className?: string }) {
  return (
    <div className={className} data-testid="certificate-path">
      <ol className="grid grid-flow-col auto-cols-[minmax(0,1fr)]">
        {steps.map((s, i) => (
          <li key={s.key} data-step={s.key} data-step-state={s.state} className="relative flex min-w-0 flex-col items-center gap-2 text-center">
            {i < steps.length - 1 ? <span aria-hidden="true" className={cx('absolute start-1/2 top-[1.125rem] h-px w-full', s.state === 'done' ? 'bg-ink' : 'bg-line-strong')} /> : null}
            <Node state={s.state} />
            <span className="px-0.5 text-xs font-bold leading-5 sm:text-sm">{s.label}</span>
            {s.detail ? <span className="text-xs text-muted">{s.detail}</span> : null}
            <span className="sr-only">{SR[s.state]}</span>
          </li>
        ))}
      </ol>
      {remaining ? <p className="mt-5 text-sm leading-7">{remaining}</p> : null}
    </div>
  )
}

/**
 * Gamification-OFF version: a plain checklist. No gold, no lock, no "sealed" teaser (the certificate row is left out
 * while it is not issued).
 */
export function CertificateChecklist({ steps, remaining, className }: { steps: readonly CertificatePathStep[]; remaining?: string | null; className?: string }) {
  return (
    <div className={className} data-testid="certificate-path">
      <ul className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
        {steps
          .filter((s) => s.state !== 'sealed')
          .map((s) => (
            <li key={s.key} data-step={s.key} data-step-state={s.state} className="flex items-center gap-3 border-b border-line py-3">
              <span aria-hidden="true" className={cx('grid size-6 shrink-0 place-items-center rounded-full border-2', s.state === 'done' ? 'border-brand bg-brand text-brand-ink' : 'border-line-strong')}>
                {s.state === 'done' ? <Icon name="check" className="size-4" /> : null}
              </span>
              <span className="font-bold">{s.label}</span>
              {s.detail ? <span className="ms-auto text-sm text-muted">{s.detail}</span> : null}
              <span className="sr-only">{SR[s.state]}</span>
            </li>
          ))}
      </ul>
      {remaining ? <p className="mt-4 text-sm leading-7">{remaining}</p> : null}
    </div>
  )
}
