import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'
import { lexicalToPlainText, toLexical } from '@edvora/core/richtext'

/**
 * E-031: long-form textarea fields → Lexical rich text (varchar → jsonb), with a data migration.
 *
 * Self-contained so it can be re-created after a merge (`payload migrate:create`, then paste this body):
 * - up: the column becomes jsonb holding the old text as a JSON string (`to_jsonb`, nothing lost), then every
 *   JSON-string value is converted in TypeScript with the tested `toLexical` (paragraph per blank-line block, line
 *   breaks kept; text that already is serialised Lexical JSON is parsed, not wrapped). Columns that are already
 *   jsonb are not altered, only normalised, so running it on a partly-converted DB is safe.
 * - down: every value is flattened with the tested `lexicalToPlainText` and the column goes back to varchar.
 *   Formatting (bold, lists, images…) cannot survive a down; the text does.
 */
const COLUMNS: readonly { table: string; column: string }[] = [
  { table: 'tenants', column: 'manifesto' },
  { table: 'users', column: 'public_profile_bio' },
  { table: 'courses_syllabus', column: 'description' },
  { table: 'courses_faq', column: 'answer' },
  { table: 'lessons', column: 'notes' },
  { table: 'questions', column: 'explanation' },
  { table: 'quizzes', column: 'description' },
  { table: 'assignments', column: 'description' },
  { table: 'submissions', column: 'feedback' },
]

type Db = MigrateUpArgs['db']
type Row = { id: string | number; value: unknown }

async function columnType(db: Db, table: string, column: string): Promise<string | null> {
  const res = await db.execute(
    sql`SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ${table} AND column_name = ${column}`,
  )
  const row = res.rows[0] as { data_type?: string } | undefined
  return row?.data_type ?? null
}

async function rows(db: Db, table: string, column: string, onlyStrings: boolean): Promise<Row[]> {
  const t = sql.identifier(table)
  const c = sql.identifier(column)
  const filter = onlyStrings ? sql`jsonb_typeof(${c}) = 'string'` : sql`${c} IS NOT NULL`
  const res = await db.execute(sql`SELECT id, ${c} AS value FROM ${t} WHERE ${filter}`)
  return res.rows as Row[]
}

async function setValue(db: Db, table: string, column: string, id: Row['id'], json: string | null): Promise<void> {
  await db.execute(sql`UPDATE ${sql.identifier(table)} SET ${sql.identifier(column)} = ${json}::jsonb WHERE id = ${id}`)
}

export async function up({ db, payload }: MigrateUpArgs): Promise<void> {
  for (const { table, column } of COLUMNS) {
    const type = await columnType(db, table, column)
    if (type === null) continue
    const c = sql.identifier(column)
    if (type !== 'jsonb') {
      await db.execute(
        sql`ALTER TABLE ${sql.identifier(table)} ALTER COLUMN ${c} SET DATA TYPE jsonb USING CASE WHEN ${c} IS NULL OR btrim(${c}) = '' THEN NULL ELSE to_jsonb(${c}) END`,
      )
    }
    const todo = await rows(db, table, column, true)
    for (const row of todo) {
      const doc = toLexical(typeof row.value === 'string' ? row.value : null)
      await setValue(db, table, column, row.id, doc ? JSON.stringify(doc) : null)
    }
    payload.logger.info(`[e031_rich_text] ${table}.${column}: ${todo.length} text value(s) converted to Lexical`)
  }
}

export async function down({ db, payload }: MigrateDownArgs): Promise<void> {
  for (const { table, column } of COLUMNS) {
    if ((await columnType(db, table, column)) !== 'jsonb') continue
    const all = await rows(db, table, column, false)
    for (const row of all) {
      const text = lexicalToPlainText(row.value)
      await setValue(db, table, column, row.id, text === '' ? null : JSON.stringify(text))
    }
    const c = sql.identifier(column)
    await db.execute(sql`ALTER TABLE ${sql.identifier(table)} ALTER COLUMN ${c} SET DATA TYPE varchar USING (${c} #>> '{}')`)
    payload.logger.info(`[e031_rich_text] ${table}.${column}: ${all.length} value(s) flattened to text`)
  }
}
