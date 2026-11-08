import { meets } from '@edvora/core/staff'
import type { StaffSession } from '../../../lib/staff'
import { PERIOD_DAYS, applyWidgets, fa, getOverview, staffAccess, staffCtx } from '../../../lib/consoleData'
import type { PayloadRequest } from 'payload'
import type { User } from '../../../payload-types'
import { DeskPage, OverviewPanels, PageHeader, consoleBtn } from '../Desk'

export async function OverviewDesk({ s }: { s: StaffSession & { user: User; req: PayloadRequest } }) {
  const access = staffAccess(s)
  const data = applyWidgets(await getOverview(staffCtx(s), access), s.experience)
  const setup = meets(s, { any: ['settings.edit', 'roles.manage'] })
  return (
    <DeskPage desk="overview">
      <PageHeader
        title="نمای کلی"
        subtitle={`وضعیت ${s.tenant.name}: آمار ${fa(PERIOD_DAYS)} روز گذشته در برابر ${fa(PERIOD_DAYS)} روز پیش از آن. همه‌چیز از داده‌های واقعی آکادمی می‌آید.`}
        actions={
          <>
            {setup ? (
              <a href="/admin" className={consoleBtn.secondary}>
                تنظیمات و راه‌اندازی
              </a>
            ) : null}
            {access.create.courses ? (
              <a href="/admin/collections/courses/create" className={consoleBtn.primary}>
                + دورهٔ تازه
              </a>
            ) : null}
          </>
        }
      />
      <OverviewPanels data={data} />
    </DeskPage>
  )
}
