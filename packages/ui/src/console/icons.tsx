import { cx } from '../cx'

/**
 * Console icon set (E-035): 24px line icons drawn for Edvora (not taken from any template or icon pack).
 * Decorative: always pair with visible text or an aria-label on the control.
 */
const P = {
  dashboard: 'M4 4h7v8H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 14h7v6H4z',
  leads: 'M12 4v4M5 8h14l-5 6v5l-4 1v-6zM3 4h4M17 4h4',
  desk: 'M3 18h18M5 18V9l7-4 7 4v9M9 18v-5h6v5',
  orders: 'M6 4h12l1 4H5zM5 8h14v12H5zM9 12h6',
  card: 'M3 6h18v12H3zM3 10h18M7 15h3',
  coupon: 'M4 8a2 2 0 0 0 0 4v0a2 2 0 0 1 0 4v2h16v-2a2 2 0 0 1 0-4v0a2 2 0 0 0 0-4V6H4zM10 9l4 6M10 15h.01M14 9h.01',
  course: 'M3 8l9-4 9 4-9 4zM7 10.5V15c0 1.4 2.2 3 5 3s5-1.600 5-3v-4.500M21 8v6',
  lesson: 'M7 4h11a1 1 0 0 1 1 1v14H8a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1zM6 17a2 2 0 0 1 2-2h11M10 8h5',
  cohort: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 19c0-3 2.7-5 6-5s6 2 6 5M16 5.500a3 3 0 0 1 0 5.500M17 14.200c2.200.6 4 2.300 4 4.800',
  quiz: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3M7 9h.01M7 13h.01M7 17h.01',
  question: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.500 9.500a2.500 2.500 0 1 1 3.500 2.300c-.7.400-1 .9-1 1.700M12 17h.01',
  assignment: 'M8 4h8l3 3v13H5V4zM8 4v4h8M8 13l2.500 2.500L16 10',
  grading: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  student: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.600-6 8-6s8 2 8 6',
  users: 'M9 11a3.500 3.500 0 1 0 0-7 3.500 3.500 0 0 0 0 7zM2.500 20c0-3.300 2.900-5.500 6.500-5.500s6.500 2.200 6.500 5.500M16 4.300a3.500 3.500 0 0 1 0 6.400M18 14.800c2 .7 3.500 2.300 3.500 5.200',
  enrol: 'M5 4h10l4 4v12H5zM15 4v4h4M9 14l2 2 4-4',
  certificate: 'M4 5h16v11H4zM8 9h8M8 12.500h4M15 16l1.500 4 1.500-2.500L19.500 20 18 16',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 20h8M10 17h4',
  post: 'M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5',
  media: 'M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.500h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.400 13a7.800 7.800 0 0 0 0-2l2-1.500-2-3.500-2.300 1a7.600 7.600 0 0 0-1.700-1L15 3.500h-4L10.600 6a7.600 7.600 0 0 0-1.700 1l-2.300-1-2 3.500 2 1.500a7.800 7.800 0 0 0 0 2l-2 1.500 2 3.500 2.300-1a7.600 7.600 0 0 0 1.700 1l.4 2.500h4l.4-2.500a7.600 7.600 0 0 0 1.700-1l2.300 1 2-3.500z',
  building: 'M5 21V5l7-2 7 2v16M3 21h18M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4',
  roles: 'M12 3l7 3v5c0 4.500-3 8.500-7 10-4-1.500-7-5.500-7-10V6zM9.500 12l2 2 3.500-4',
  membership: 'M4 6h16v12H4zM8 10h5M8 14h3M16 10.500a1.500 1.500 0 1 0 0 .01',
  audit: 'M5 3h10l4 4v14H5zM15 3v4h4M9 12h6M9 16h6M9 8h2',
  lock: 'M6 11h12v9H6zM8.500 11V8a3.500 3.500 0 0 1 7 0v3',
  shield: 'M12 3l7 3v5c0 4.500-3 8.500-7 10-4-1.500-7-5.500-7-10V6zM9 12l2 2 4-4',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.500 2h-15zM10 20.500a2.200 2.200 0 0 0 4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.500v2M12 19.500v2M4.500 4.500l1.400 1.400M18.100 18.100l1.400 1.400M2.500 12h2M19.500 12h2M4.500 19.500l1.400-1.400M18.100 5.900l1.400-1.400',
  moon: 'M20.500 13.500A8.500 8.500 0 1 1 10.500 3.500a6.500 6.500 0 0 0 10 10z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sidebar: 'M4 5h16v14H4zM9 5v14',
  close: 'M6 6l12 12M18 6L6 18',
  chevron: 'M6 9l6 6 6-6',
  chevronStart: 'M14.500 6l-6 6 6 6',
  chevronEnd: 'M9.500 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 4v11M7.500 11l4.500 4.500 4.500-4.500M5 20h14',
  up: 'M7 16l5-5 5 5',
  down: 'M7 8l5 5 5-5',
  trendUp: 'M4 17l6-6 4 4 6-7M15 8h5v5',
  trendDown: 'M4 7l6 6 4-4 6 7M15 16h5v-5',
  alert: 'M12 4l9 16H3zM12 10v4M12 17h.01',
  check: 'M5 12.500l4.500 4.500L19 7.500',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  calendar: 'M4.500 6h15v14h-15zM4.500 10h15M9 4v4M15 4v4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5H5V6h5',
  site: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  support: 'M4 5h16v11H9l-5 4zM8 9h8M8 12h5',
  live: 'M4 6h12v12H4zM16 10l5-3v10l-5-3z',
  filter: 'M4 5h16l-6 7v6l-4 2v-8z',
  sort: 'M8 5v14M5 16l3 3 3-3M16 19V5M13 8l3-3 3 3',
  logout: 'M10 4H5v16h5M15 8l4 4-4 4M19 12H9',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.600-6 8-6s8 2 8 6',
  star: 'M12 3.500l2.600 5.300 5.800.8-4.200 4.100 1 5.800L12 16.800l-5.200 2.700 1-5.800-4.200-4.100 5.800-.8z',
  inbox: 'M4 13l2.500-7h11L20 13v5H4zM4 13h5l1 2h4l1-2h5',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  phone: 'M6.500 4h3l1.500 4-2 1.500a10 10 0 0 0 5.500 5.500L16 13l4 1.500v3a2 2 0 0 1-2 2A14 14 0 0 1 4.500 6a2 2 0 0 1 2-2z',
  refresh: 'M20 11a8 8 0 0 0-14.500-3.500L4 9M4 4v5h5M4 13a8 8 0 0 0 14.500 3.500L20 15M20 20v-5h-5',
} as const

export type ConsoleIconName = keyof typeof P

export function ConsoleIcon({ name, className }: { name: ConsoleIconName; className?: string }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={cx('size-5 shrink-0', className)}>
      <path d={P[name]} />
    </svg>
  )
}

export const CONSOLE_ICON_NAMES = Object.keys(P) as ConsoleIconName[]
