import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 pt-24 text-center">
      <p className="font-latin text-6xl font-bold text-brand">404</p>
      <h1 className="mt-4 text-2xl font-black">این صفحه پیدا نشد</h1>
      <Link href="/" className="mt-6 inline-block rounded-xl bg-brand px-6 py-3 font-bold text-brand-ink">
        بازگشت به خانه
      </Link>
    </div>
  )
}
