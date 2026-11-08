import { formatJalali } from '@edvora/core'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RichText } from '../../../../components/RichText'
import type { Media } from '../../../../payload-types'
import { getPostBySlug } from '../../../../lib/queries'
import { getCurrentTenant, siteSectionOn } from '../../../../lib/tenant'

type Props = { params: Promise<{ slug: string }> }

const decode = (s: string) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = decode((await params).slug)
  if (!slug) return {}
  const tenant = await getCurrentTenant()
  const post = await getPostBySlug(tenant.id, slug)
  return post ? { title: post.title, description: post.excerpt ?? undefined } : {}
}

export default async function PostPage({ params }: Props) {
  const slug = decode((await params).slug)
  if (!slug) notFound()
  const tenant = await getCurrentTenant()
  if (!siteSectionOn(tenant, 'journal')) notFound()
  const post = await getPostBySlug(tenant.id, slug)
  if (!post) notFound()
  const cover = typeof post.cover === 'object' ? (post.cover as Media | null) : null
  const src = cover?.sizes?.hero?.url ?? cover?.url

  return (
    <article className="mx-auto max-w-3xl px-4 pt-10 md:px-8">
      <Link href="/journal" className="text-sm font-bold text-brand">← مجله</Link>
      <h1 className="mt-4 text-3xl font-black leading-tight md:text-4xl">{post.title}</h1>
      <p className="mt-3 text-sm text-muted">{[post.author, post.publishedAt ? formatJalali(post.publishedAt) : null].filter(Boolean).join(' · ')}</p>
      {src ? <img src={src} alt={cover?.alt ?? ''} className="mt-8 aspect-video w-full rounded-3xl object-cover" /> : null}
      <div className="mt-6">
        <RichText data={post.body} tenantId={tenant.id} />
      </div>
    </article>
  )
}
