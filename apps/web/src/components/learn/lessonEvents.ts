/** Tiny event bridge between the player (beacon) and the completion block: both are client islands on one page. */
export const LESSON_WATCH_EVENT = 'edvora:lesson-watch'

export type LessonWatchDetail = { lessonId: number; completed: boolean; xp: number; capped: boolean; watchedPct: number }
