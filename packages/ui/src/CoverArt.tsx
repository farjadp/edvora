export type CoverArtProps = {
  title: string
  /** Large faded watermark behind the title, e.g. a programme code. Defaults to the first two letters of the title. */
  mark?: string | null
  /** When set, the image is shown instead of the generated art. */
  imageSrc?: string | null
  imageAlt?: string | null
  size?: 'card' | 'hero'
}

/**
 * Cover for a course (or anything with a title): the uploaded image, or generated art in the tenant's brand colour
 * with an accent stripe. Fills its parent; the parent sets the aspect ratio.
 */
export function CoverArt({ title, mark, imageSrc, imageAlt, size = 'card' }: CoverArtProps) {
  if (imageSrc) {
    // Cards sit in long horizontal rows: defer them. The hero is above the fold: load it now.
    return (
      <img
        src={imageSrc}
        alt={imageAlt ?? title}
        loading={size === 'hero' ? 'eager' : 'lazy'}
        decoding="async"
        className="size-full object-cover"
      />
    )
  }
  return (
    <div className="relative grid size-full place-items-center overflow-hidden bg-brand p-6 text-brand-ink">
      <span className="absolute -start-6 -top-10 font-latin text-[9rem] font-bold leading-none opacity-15" aria-hidden>
        {mark ?? title.slice(0, 2)}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-1.5 bg-accent" aria-hidden />
      <span className={size === 'hero' ? 'relative text-4xl font-black md:text-6xl' : 'relative text-2xl font-black'}>{title}</span>
    </div>
  )
}
