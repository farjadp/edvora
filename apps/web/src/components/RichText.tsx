import { RichText as PayloadRichText } from '@payloadcms/richtext-lexical/react'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

/** Rich text from Payload (journal posts, content pages) with Edvora's reading typography. */
export function RichText({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object' || !('root' in data)) return null
  return (
    <PayloadRichText
      data={data as SerializedEditorState}
      className="text-lg leading-9 [&_a]:text-brand [&_a]:underline [&_blockquote]:border-s-4 [&_blockquote]:border-brand [&_blockquote]:ps-5 [&_blockquote]:text-muted [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-black [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-bold [&_h4]:mt-6 [&_h4]:font-bold [&_img]:my-6 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-2xl [&_li]:mt-2 [&_ol]:list-decimal [&_ol]:ps-6 [&_p]:mt-5 [&_ul]:mt-5 [&_ul]:list-disc [&_ul]:ps-6"
    />
  )
}
