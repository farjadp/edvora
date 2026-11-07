'use client'

import { DeskLoadError } from '../../../../components/staff/DeskLoadError'

/** A desk that failed to load: plain retry card, no stack trace. */
export default function DeskError() {
  return <DeskLoadError />
}
