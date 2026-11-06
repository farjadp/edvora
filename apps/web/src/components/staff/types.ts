export type StaffIconName =
  | 'overview'
  | 'leads'
  | 'finance'
  | 'students'
  | 'teaching'
  | 'support'
  | 'content'
  | 'settings'
  | 'security'
  | 'site'

export type StaffNavItem = {
  key: string
  label: string
  href: string
  icon?: StaffIconName
  /** Leaves the staff shell (e.g. /admin): shows the ↗ mark. Same tab. */
  external?: boolean
}

export type StaffUserInfo = {
  name: string
  email: string
  /** Role names of the active membership in this academy. */
  roles: string[]
}
