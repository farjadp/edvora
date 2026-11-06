import { GAMIFICATION_DEFAULTS as D, WEEK_DAYS, type WeekDay } from '@edvora/core/gamification'
import type { Field } from 'payload'
import { isSuperAdmin } from '../access/roles'

const platformOnly = ({ req }: { req: { user?: unknown } }) => isSuperAdmin(req.user as never)

const WEEK_DAY_LABELS: Record<WeekDay, string> = {
  saturday: 'شنبه',
  sunday: 'یکشنبه',
  monday: 'دوشنبه',
  tuesday: 'سه‌شنبه',
  wednesday: 'چهارشنبه',
  thursday: 'پنجشنبه',
  friday: 'جمعه',
}
const weekDayOptions = WEEK_DAYS.map((d) => ({ value: d, label: { fa: WEEK_DAY_LABELS[d], en: d } }))

const toggle = (name: keyof typeof D.mechanics, fa: string, en: string, description?: string): Field => ({
  name,
  type: 'checkbox',
  defaultValue: D.mechanics[name],
  label: { fa, en },
  ...(description ? { admin: { description } } : {}),
})

/** Breaks (Nowruz, cohort breaks): weeks/days that touch one are neutral for streaks. */
export const breaksField = (description: string): Field => ({
  name: 'breaks',
  type: 'array',
  label: { fa: 'تعطیلات و وقفه‌ها', en: 'Breaks' },
  admin: { description },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'label', type: 'text', label: { fa: 'عنوان', en: 'Label' }, admin: { description: 'e.g. نوروز' } },
        { name: 'startsAt', type: 'date', required: true, label: { fa: 'از', en: 'From' }, timezone: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
        { name: 'endsAt', type: 'date', required: true, label: { fa: 'تا', en: 'Until' }, timezone: true, admin: { date: { pickerAppearance: 'dayOnly' } } },
      ],
    },
  ],
})

/**
 * `tenants.gamification` (E-028 T1, PRD §2). Read only through `gamificationFor(tenant)` / `normalizeGamification`,
 * which fill PRD defaults for any missing value. XP values and the completion threshold are super-admin only (G1.6).
 */
export const gamificationSettingsField: Field = {
  name: 'gamification',
  type: 'group',
  label: { fa: 'انگیزش و پیشرفت (گیمیفیکیشن)', en: 'Gamification' },
  admin: { description: 'Turning it off hides XP, levels, streaks, badges and celebrations; history is kept, so turning it back on restores everything.' },
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: D.enabled, label: { fa: 'فعال', en: 'Enabled' } },
        {
          name: 'audience',
          type: 'select',
          defaultValue: D.audience,
          label: { fa: 'برای', en: 'Audience' },
          options: [
            { value: 'both', label: { fa: 'دانشجویان و کارکنان', en: 'Students and staff' } },
            { value: 'students', label: { fa: 'فقط دانشجویان', en: 'Students only' } },
            { value: 'staff', label: { fa: 'فقط کارکنان', en: 'Staff only' } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        toggle('xp', 'امتیاز و سطح', 'XP & levels'),
        toggle('streak', 'ریتم هفتگی', 'Weekly rhythm'),
        toggle('badges', 'نشان‌ها', 'Badges'),
        toggle('celebrations', 'لحظه‌های موفقیت', 'Celebrations'),
        toggle('leaderboard', 'جدول ورودی (با رضایت دانشجو)', 'Cohort leaderboard (opt-in)', 'Off by default; students opt in one by one.'),
        toggle('staffGoals', 'هدف روزانهٔ مشاوران', 'Advisor goals'),
        toggle('financeInbox', 'صندوق مالی', 'Finance inbox zero'),
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'weeklyGoalDays', type: 'number', min: 1, max: 5, defaultValue: D.weeklyGoalDays, label: { fa: 'هدف هفتگی (روز یادگیری)', en: 'Weekly goal (learning days)' } },
        { name: 'weekStart', type: 'select', defaultValue: D.weekStart, options: weekDayOptions, label: { fa: 'شروع هفته', en: 'Week starts on' } },
        { name: 'freezeEveryWeeks', type: 'number', min: 1, max: 52, defaultValue: D.freezeEveryWeeks, label: { fa: 'یک فرصت جبران به ازای هر … هفته', en: 'One freeze per N streak weeks' } },
        { name: 'freezeMax', type: 'number', min: 0, max: 10, defaultValue: D.freezeMax, label: { fa: 'حداکثر فرصت ذخیره', en: 'Max banked freezes' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'dailyXpCap',
          type: 'number',
          min: 10,
          max: 10_000,
          defaultValue: D.dailyXpCap,
          label: { fa: 'سقف امتیاز روزانه', en: 'Daily XP cap' },
          access: { create: platformOnly, update: platformOnly },
        },
        {
          name: 'completionThresholdPct',
          type: 'number',
          min: 50,
          max: 100,
          defaultValue: D.completionThresholdPct,
          label: { fa: 'درصد تماشا برای تکمیل جلسه', en: 'Watched % for completion' },
          access: { create: platformOnly, update: platformOnly },
        },
        { name: 'leaderboardSize', type: 'number', min: 3, max: 10, defaultValue: D.leaderboardSize, label: { fa: 'تعداد نفرات جدول', en: 'Leaderboard top N' } },
        { name: 'leaderboardMinimum', type: 'number', min: 2, max: 100, defaultValue: D.leaderboardMinimum, label: { fa: 'حداقل شرکت‌کننده', en: 'Leaderboard minimum' } },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'weekendDays',
          type: 'select',
          hasMany: true,
          defaultValue: [...D.weekendDays],
          options: weekDayOptions,
          label: { fa: 'روزهای تعطیل کارکنان', en: 'Staff days off' },
        },
        { name: 'teamWeeklyGoal', type: 'number', min: 1, label: { fa: 'هدف هفتگی تیم', en: 'Team weekly goal' }, admin: { description: 'Empty = every follow-up due this week.' } },
      ],
    },
    breaksField('Academy-wide (e.g. Nowruz). Student weeks and staff days that touch a break are neutral.'),
  ],
}
