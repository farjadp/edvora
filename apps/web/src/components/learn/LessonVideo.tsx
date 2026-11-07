'use client'

import { useEffect, useRef } from 'react'
import { reportLessonWatch } from '../../app/(frontend)/actions'
import { LESSON_WATCH_EVENT, type LessonWatchDetail } from './lessonEvents'

/** Seconds between beacons while the video is playing and the tab is visible (E-028 T3: 15–30 s). */
const BEAT_MS = 20_000
/** One `timeupdate` jump bigger than this is a seek, not playing time. */
const MAX_STEP_SECONDS = 2
const MAX_BEAT_SECONDS = 600

/**
 * The lesson <video> plus the progress beacon. It reports seconds actually PLAYED (seeks and hidden tabs do not
 * count) to `reportLessonWatch`; the server decides when the lesson is complete and what XP it pays. A failed
 * beat is kept and retried with the next one. Nothing is shown here: the completion block listens for the event.
 */
export function LessonVideo({ src, lessonId, track }: { src: string; lessonId: number; track: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  const played = useRef(0)
  const last = useRef<number | null>(null)
  const sending = useRef(false)
  const finished = useRef(false)

  useEffect(() => {
    const video = ref.current
    if (!video || !track) return

    const flush = async () => {
      if (sending.current || finished.current) return
      const seconds = Math.min(MAX_BEAT_SECONDS, Math.floor(played.current))
      if (seconds < 1) return
      sending.current = true
      played.current -= seconds
      try {
        const duration = Number.isFinite(video.duration) && video.duration > 0 ? Math.round(video.duration) : null
        const res = await reportLessonWatch({ lessonId, playedSeconds: seconds, durationSeconds: duration })
        if (!res.ok) {
          played.current = Math.min(MAX_BEAT_SECONDS, played.current + seconds)
          return
        }
        if (res.completed) {
          finished.current = true
          const detail: LessonWatchDetail = { lessonId, completed: true, xp: res.xp, capped: res.capped, watchedPct: res.watchedPct }
          window.dispatchEvent(new CustomEvent<LessonWatchDetail>(LESSON_WATCH_EVENT, { detail }))
        }
      } catch {
        played.current = Math.min(MAX_BEAT_SECONDS, played.current + seconds)
      } finally {
        sending.current = false
      }
    }

    const onTime = () => {
      if (video.paused || video.seeking) return
      const t = video.currentTime
      if (last.current !== null) {
        const d = t - last.current
        if (d > 0 && d <= MAX_STEP_SECONDS) played.current += d
      }
      last.current = t
    }
    const rebase = () => {
      last.current = video.currentTime
    }
    const onPause = () => {
      last.current = null
      void flush()
    }
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void flush()
    }
    const timer = window.setInterval(() => {
      if (!video.paused && document.visibilityState === 'visible') void flush()
    }, BEAT_MS)

    video.addEventListener('timeupdate', onTime)
    video.addEventListener('play', rebase)
    video.addEventListener('seeked', rebase)
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', onPause)
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      window.clearInterval(timer)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('play', rebase)
      video.removeEventListener('seeked', rebase)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onPause)
      document.removeEventListener('visibilitychange', onHidden)
    }
  }, [lessonId, track])

  return <video ref={ref} src={src} controls controlsList="nodownload" data-testid="lesson-video" className="size-full" />
}
