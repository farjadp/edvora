import { LEARNING_EVENT_TYPES } from '@edvora/core/gamification'
import type { CollectionConfig } from 'payload'
import { allow, anyOf, nobody, ownRecords } from '../access/permissions'

const SCOPE = { course: 'course', cohort: 'cohort' }

/**
 * Gamification ledger (E-028 T2, PRD §6). Append-only and the source of truth for XP, levels, streaks and badges;
 * the totals on `enrollments.gamification` are a cache rebuilt from these rows (lib/gamification.ts).
 * Written ONLY by server code (`recordLearningEvent`) after it checked tenant, user and enrollment: nobody can
 * create, edit or delete rows through the API or the admin. Corrections are new `reversal` rows, never edits.
 * `(tenant, idempotencyKey)` is unique in the database: one award per source, whatever the retries.
 */
export const LearningEvents: CollectionConfig = {
  slug: 'learning-events',
  labels: { singular: { fa: 'رویداد یادگیری', en: 'Learning event' }, plural: { fa: 'دفتر امتیازها', en: 'Learning ledger' } },
  admin: {
    defaultColumns: ['occurredAt', 'user', 'type', 'xp', 'sourceId', 'enrollment'],
    group: { fa: 'آموزش', en: 'Learning' },
    description: 'Append-only. Corrections are reversal rows.',
  },
  defaultSort: '-occurredAt',
  access: {
    // Staff need enrollments.view in the academy (course/cohort scope). Students are not Payload users, so the REST API
    // answers them 403 (verified, QA-028-03); the student UI reads their own rows through server queries, not this API.
    read: anyOf(ownRecords('user'), allow('enrollments.view', SCOPE)),
    create: nobody,
    update: nobody,
    delete: nobody,
  },
  indexes: [{ fields: ['tenant', 'idempotencyKey'], unique: true }],
  fields: [
    {
      type: 'row',
      fields: [
        { name: 'user', type: 'relationship', relationTo: 'users', required: true, index: true, admin: { readOnly: true } },
        { name: 'enrollment', type: 'relationship', relationTo: 'enrollments', index: true, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'course', type: 'relationship', relationTo: 'courses', index: true, admin: { readOnly: true } },
        { name: 'cohort', type: 'relationship', relationTo: 'cohorts', index: true, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'type', type: 'select', required: true, index: true, options: LEARNING_EVENT_TYPES.map((t) => ({ value: t, label: t })), admin: { readOnly: true } },
        { name: 'sourceId', type: 'text', index: true, admin: { readOnly: true, description: 'Lesson / quiz / assignment id, badge key, week key.' } },
        { name: 'xp', type: 'number', required: true, defaultValue: 0, admin: { readOnly: true, description: 'Granted (after the daily cap). Negative on reversals.' } },
        { name: 'requestedXp', type: 'number', defaultValue: 0, admin: { readOnly: true } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'occurredAt', type: 'date', required: true, index: true, admin: { readOnly: true, date: { pickerAppearance: 'dayAndTime' } } },
        { name: 'idempotencyKey', type: 'text', required: true, admin: { readOnly: true } },
        { name: 'reverses', type: 'text', index: true, admin: { readOnly: true, description: 'Idempotency key of the event this reversal cancels.' } },
      ],
    },
    { name: 'meta', type: 'json', admin: { readOnly: true } },
    { name: 'actor', type: 'relationship', relationTo: 'users', admin: { readOnly: true, description: 'Staff who caused it (grade, reversal); empty for the student’s own actions.' } },
    { name: 'note', type: 'text', admin: { readOnly: true } },
  ],
}
