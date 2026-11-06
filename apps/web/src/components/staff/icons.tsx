import type { StaffIconName } from './types'

const paths: Record<StaffIconName, string> = {
  overview: 'M4 13h6V4H4zM14 20h6V11h-6zM4 20h6v-3H4zM14 8h6V4h-6z',
  leads: 'M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 20c0-3.3 3.6-5 8-5s8 1.7 8 5',
  finance: 'M3 7h18v12H3zM3 11h18M7 15h3',
  students: 'M2 9l10-5 10 5-10 5zM6 11.5V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.5',
  teaching: 'M4 5h16v11H4zM8 20h8M12 16v4',
  support: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  content: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2l-1-2-3 1 .5 2L6 8.5 4 8l-1 3 2 1v2l-2 1 1 3 2-.5L7.5 19l-.5 2 3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3-2-1z',
  security: 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6zM9 12l2 2 4-4',
  site: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0ZM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
}

export function StaffIcon({ name, className = 'size-5' }: { name: StaffIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name]} />
    </svg>
  )
}
