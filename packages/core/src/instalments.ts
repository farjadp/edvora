import { rial, type Rial } from './money'

export type InstalmentPlanInput = {
  total: Rial
  /** Number of payments including the down payment. 1 = pay in full. */
  count: number
  /** Down payment as a percent of total (0–100). Ignored when count = 1. */
  downPaymentPercent?: number
  firstDueDate: Date
  intervalDays?: number
}

export type Instalment = {
  index: number
  amount: Rial
  dueDate: Date
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Splits a total into instalments. Amounts are rounded down to whole toman (10 rials);
 * any remainder goes on the last instalment so the sum always equals the total.
 */
export function buildInstalmentPlan(input: InstalmentPlanInput): Instalment[] {
  const { total, count, downPaymentPercent = 0, firstDueDate, intervalDays = 30 } = input
  if (!Number.isInteger(count) || count < 1 || count > 24) {
    throw new RangeError('Instalment count must be an integer between 1 and 24')
  }
  if (downPaymentPercent < 0 || downPaymentPercent > 100) {
    throw new RangeError('Down payment percent must be 0–100')
  }
  const dueDate = (i: number) => new Date(firstDueDate.getTime() + i * intervalDays * DAY_MS)
  if (count === 1) return [{ index: 0, amount: total, dueDate: dueDate(0) }]

  const toTomanFloor = (n: number) => Math.floor(n / 10) * 10
  const amounts: number[] = []
  if (downPaymentPercent > 0) {
    const down = toTomanFloor((total * downPaymentPercent) / 100)
    const rest = total - down
    const each = toTomanFloor(rest / (count - 1))
    amounts.push(down, ...Array.from({ length: count - 1 }, () => each))
  } else {
    const each = toTomanFloor(total / count)
    amounts.push(...Array.from({ length: count }, () => each))
  }
  const sum = amounts.reduce((a, b) => a + b, 0)
  amounts[amounts.length - 1] = (amounts[amounts.length - 1] ?? 0) + (total - sum)

  return amounts.map((amount, index) => ({ index, amount: rial(amount), dueDate: dueDate(index) }))
}
