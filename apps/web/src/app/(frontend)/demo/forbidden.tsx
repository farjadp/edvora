import { Card, btnPrimary } from '../../../components/staff/ui'

/** 403 for /admin inside a demo sandbox (C4, S10). */
export default function SandboxForbidden() {
  return (
    <div className="mx-auto grid w-full max-w-lg gap-6 px-4 py-12">
      <Card>
        <h1 className="text-2xl font-black leading-10">پنل تنظیمات در آکادمی آزمایشی بسته است</h1>
        <p className="mt-3 leading-8 text-muted">
          در دمو، کارهای روزانه را از میز کار انجام دهید. تنظیمات سطح آکادمی (دامنه، درگاه پرداخت، پیامک) در آکادمی واقعی در دسترس است.
        </p>
        <a href="/staff" className={`${btnPrimary(true)} mt-6`}>
          رفتن به میز کار
        </a>
      </Card>
    </div>
  )
}
