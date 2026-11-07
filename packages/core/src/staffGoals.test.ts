import { describe, expect, it } from 'vitest'
import { advisorDailyGoal, financeInbox, followUpStreak, teamWeeklyGoal, type GoalLead } from './staffGoals'

// Tehran = UTC+3:30.
const at = (date: string, time = '10:00') => {
  const [h, m] = time.split(':').map(Number)
  return new Date(Date.parse(`${date}T00:00:00Z`) + ((h! * 60 + m!) - 210) * 60_000).toISOString()
}
const ME = 7
const lead = (id: number, next: string | null, followUps: GoalLead['followUps'] = [], advisorId: number = ME): GoalLead => ({ id, advisorId, nextFollowUpAt: next, followUps })

describe('advisor daily goal (G8)', () => {
  const now = new Date(at('2026-11-08', '16:00')) // Sunday
  it('«۵ از ۸»: due today = open due + handled today; only recorded outcomes count', () => {
    const leads: GoalLead[] = [
      ...[1, 2, 3, 4, 5].map((i) => lead(i, at('2026-11-10'), [{ at: at('2026-11-08', '11:00'), outcome: 'reached', by: ME, dueAt: at('2026-11-08', '09:00') }])),
      lead(6, at('2026-11-08', '09:00')),
      lead(7, at('2026-11-07', '09:00')), // overdue counts as due
      lead(8, at('2026-11-12'), [{ at: at('2026-11-08', '12:00'), outcome: 'date_moved', by: ME, dueAt: at('2026-11-08', '09:00') }]),
      lead(9, at('2026-11-09')), // tomorrow: not due
      lead(10, at('2026-11-08'), [], 99), // someone else's
    ]
    expect(advisorDailyGoal({ leads, advisorId: ME, now })).toEqual({ due: 8, done: 5, remaining: 3, complete: false })
  })
  it('same lead, two outcomes the same day → counted once (G8.3); another advisor’s entry gives no credit (G8.5)', () => {
    const leads = [
      lead(1, at('2026-11-11'), [
        { at: at('2026-11-08', '10:00'), outcome: 'no_answer', by: ME, dueAt: at('2026-11-08', '09:00') },
        { at: at('2026-11-08', '12:00'), outcome: 'no_answer', by: ME, dueAt: at('2026-11-08', '11:00') },
      ]),
      lead(2, at('2026-11-11'), [{ at: at('2026-11-08', '10:00'), outcome: 'reached', by: 99, dueAt: at('2026-11-08', '09:00') }]),
    ]
    expect(advisorDailyGoal({ leads, advisorId: ME, now })).toEqual({ due: 2, done: 1, remaining: 1, complete: false })
  })
})

describe('follow-up streak (G8.4)', () => {
  const weekendDays = ['thursday', 'friday'] as const
  it('counts working days with all dues handled; weekend and zero-due days are neutral', () => {
    // Sat 31 Oct … Wed 4 Nov handled on the day; Thu/Fri weekend; Sat 7 Nov nothing due; now Sun 8 Nov.
    const days = ['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04']
    const leads = days.map((d, i) => lead(i + 1, null, [{ at: at(d, '15:00'), outcome: 'reached', by: ME, dueAt: at(d, '09:00') }]))
    const s = followUpStreak({ leads, advisorId: ME, now: new Date(at('2026-11-08', '09:00')), weekendDays: [...weekendDays] })
    expect(s.current).toBe(5)
    expect(s.todayComplete).toBe(false)
  })
  it('a late follow-up misses the due day; the first miss of a Jalali month is frozen, the second breaks', () => {
    const leads = [
      lead(1, null, [{ at: at('2026-11-01', '10:00'), outcome: 'reached', by: ME, dueAt: at('2026-10-31', '09:00') }]), // Sat missed (frozen)
      lead(2, null, [{ at: at('2026-11-03', '10:00'), outcome: 'reached', by: ME, dueAt: at('2026-11-02', '09:00') }]), // Mon missed
      lead(3, null, [{ at: at('2026-11-04', '10:00'), outcome: 'reached', by: ME, dueAt: at('2026-11-04', '09:00') }]),
    ]
    const s = followUpStreak({ leads, advisorId: ME, now: new Date(at('2026-11-05', '09:00')), weekendDays: [...weekendDays] })
    const states = s.days.slice(-5).map((d) => d.state)
    expect(states).toEqual(['frozen', 'good', 'missed', 'good', 'good'])
    expect(s.current).toBe(2)
  })
  it('moving a due date without an outcome is a miss, not a handled follow-up', () => {
    const leads = [lead(1, at('2026-11-10'), [{ at: at('2026-11-03', '10:00'), outcome: 'date_moved', by: ME, dueAt: at('2026-11-03', '09:00') }])]
    const s = followUpStreak({ leads, advisorId: ME, now: new Date(at('2026-11-04', '09:00')), weekendDays: [], lookbackDays: 3 })
    expect(s.days.map((d) => d.state)).toEqual(['neutral', 'neutral', 'frozen'])
  })
})

describe('team goal (G9)', () => {
  it('one shared number, on-time follow-ups this week', () => {
    const leads = [
      lead(1, null, [{ at: at('2026-11-08', '10:00'), outcome: 'reached', by: 1, dueAt: at('2026-11-08', '09:00') }]),
      lead(2, null, [{ at: at('2026-11-09', '10:00'), outcome: 'reached', by: 2, dueAt: at('2026-11-08', '09:00') }]), // late
      lead(3, at('2026-11-12')),
      lead(4, at('2026-11-20')), // next week
    ]
    expect(teamWeeklyGoal({ leads, now: new Date(at('2026-11-09')), weekStart: 'saturday', target: null })).toEqual({ done: 1, target: 3, pct: 33, reached: false, weekKey: '2026-11-07' })
    expect(teamWeeklyGoal({ leads, now: new Date(at('2026-11-09')), weekStart: 'saturday', target: 1 }).reached).toBe(true)
  })
})

describe('finance inbox zero (G10)', () => {
  it('last attempt decides; failed needs attention; overdue only on partly paid orders', () => {
    const inbox = financeInbox({
      now: new Date(at('2026-11-08')),
      orders: [
        { id: 1, status: 'partially_paid', instalments: [{ index: 0, amount: 10, dueDate: at('2026-10-01'), status: 'paid' }, { index: 1, amount: 20, dueDate: at('2026-11-01') }], payments: [{ instalmentIndex: 0, status: 'verified' }] },
        { id: 2, status: 'pending', instalments: [{ index: 0, amount: 30, dueDate: at('2026-11-01') }], payments: [{ instalmentIndex: 0, status: 'failed' }, { instalmentIndex: 0, status: 'started' }] },
        { id: 3, status: 'pending', instalments: [{ index: 0, amount: 40, dueDate: at('2026-11-01') }], payments: [{ instalmentIndex: 0, status: 'failed' }] },
        { id: 4, status: 'cancelled', instalments: [{ index: 0, amount: 50, dueDate: at('2026-11-01') }], payments: [{ instalmentIndex: 0, status: 'started' }] },
      ],
    })
    expect(inbox).toMatchObject({ toVerify: 1, needsAttention: 1, overdue: 1, total: 3, zero: false })
    expect(financeInbox({ now: new Date(), orders: [] }).zero).toBe(true)
  })
})
