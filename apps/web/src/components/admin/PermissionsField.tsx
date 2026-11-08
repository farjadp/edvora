'use client'

import { PERMISSION_DESCRIPTIONS, PERMISSION_GROUPS, PERMISSION_GROUP_LABELS, type AcademyPermission, type PermissionGroup } from '@edvora/core/permissions'
import { toPersianDigits } from '@edvora/core/digits'
import { useField, useTranslation } from '@payloadcms/ui'
import type { SelectFieldClientComponent } from 'payload'
import { useId, useMemo, useState } from 'react'

const GROUPS = (Object.keys(PERMISSION_GROUPS) as PermissionGroup[]).filter((g) => g !== 'platform')

/**
 * Roles → «دسترسی‌ها» (E-039, ADR 016): the permission catalogue grouped by area, each key with its description.
 * Stores the same `permissions` array as the plain select did; the collection hook still validates the list and
 * applies the no-escalation rule, so this is only a clearer way to pick.
 */
export const PermissionsField: SelectFieldClientComponent = ({ path, readOnly, field }) => {
  const { value, setValue } = useField<string[] | null>({ path })
  const { i18n } = useTranslation()
  const fa = i18n.language !== 'en'
  const num = (n: number) => (fa ? toPersianDigits(String(n)) : String(n))
  const [q, setQ] = useState('')
  const searchId = useId()
  const disabled = Boolean(readOnly || field?.admin?.readOnly)
  const selected = useMemo(() => new Set(value ?? []), [value])

  const total = GROUPS.reduce((n, g) => n + PERMISSION_GROUPS[g].length, 0)
  const needle = q.trim().toLowerCase()
  const matches = (p: AcademyPermission) => {
    if (!needle) return true
    const d = PERMISSION_DESCRIPTIONS[p]
    return p.toLowerCase().includes(needle) || d.fa.includes(q.trim()) || d.en.toLowerCase().includes(needle)
  }

  const write = (next: Set<string>) => setValue(GROUPS.flatMap((g) => (PERMISSION_GROUPS[g] as readonly string[]).filter((p) => next.has(p))))
  const toggle = (p: string) => {
    const next = new Set(selected)
    if (next.has(p)) next.delete(p)
    else next.add(p)
    write(next)
  }
  const setGroup = (g: PermissionGroup, on: boolean) => {
    const next = new Set(selected)
    for (const p of PERMISSION_GROUPS[g]) {
      if (on) next.add(p)
      else next.delete(p)
    }
    write(next)
  }

  return (
    <div className="field-type ed-perms" data-testid="permissions-field">
      <div className="ed-perms__head">
        <div>
          <p className="ed-perms__title">{fa ? 'دسترسی‌های این نقش' : 'Permissions of this role'}</p>
          <p className="ed-perms__count" aria-live="polite">
            {fa ? `${num(selected.size)} از ${num(total)} دسترسی انتخاب شده` : `${selected.size} of ${total} selected`}
          </p>
        </div>
        <div className="ed-perms__tools">
          <label htmlFor={searchId} className="ed-perms__sr">
            {fa ? 'جست‌وجوی دسترسی' : 'Search permissions'}
          </label>
          <input
            id={searchId}
            type="search"
            className="ed-perms__search"
            placeholder={fa ? 'جست‌وجو: مثلاً «سفارش» یا leads' : 'Search, e.g. orders'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <a className="ed-perms__compare" href="/admin/roles-compare">
            {fa ? 'مقایسهٔ نقش‌ها' : 'Compare roles'}
          </a>
        </div>
      </div>

      <div className="ed-perms__groups">
        {GROUPS.map((g) => {
          const keys = (PERMISSION_GROUPS[g] as readonly AcademyPermission[]).filter(matches)
          if (keys.length === 0) return null
          const on = PERMISSION_GROUPS[g].filter((p) => selected.has(p)).length
          const all = on === PERMISSION_GROUPS[g].length
          const label = fa ? PERMISSION_GROUP_LABELS[g].fa : PERMISSION_GROUP_LABELS[g].en
          return (
            <fieldset key={g} className="ed-perms__group" data-group={g}>
              <legend className="ed-perms__legend">
                <span>{label}</span>
                <span className="ed-perms__chip" data-full={all ? 'true' : undefined}>
                  {num(on)}/{num(PERMISSION_GROUPS[g].length)}
                </span>
              </legend>
              {!disabled ? (
                <div className="ed-perms__bar">
                  <button type="button" className="ed-perms__all" onClick={() => setGroup(g, !all)} aria-label={`${all ? (fa ? 'برداشتن همه' : 'Clear all') : fa ? 'انتخاب همه' : 'Select all'}: ${label}`}>
                    {all ? (fa ? 'برداشتن همه' : 'Clear all') : fa ? 'انتخاب همه' : 'Select all'}
                  </button>
                </div>
              ) : null}
              <ul className="ed-perms__list">
                {keys.map((p) => {
                  const d = PERMISSION_DESCRIPTIONS[p]
                  return (
                    <li key={p}>
                      <label className="ed-perms__item">
                        <input type="checkbox" checked={selected.has(p)} disabled={disabled} onChange={() => toggle(p)} />
                        <span className="ed-perms__text">
                          <span className="ed-perms__desc">{fa ? d.fa : d.en}</span>
                          <code className="ed-perms__key" dir="ltr">
                            {p}
                          </code>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </fieldset>
          )
        })}
      </div>
    </div>
  )
}
