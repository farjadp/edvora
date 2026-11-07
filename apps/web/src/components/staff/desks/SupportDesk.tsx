import { EmptyState, Panel } from '@edvora/ui/console'
import { DeskPage, PageHeader } from '../Desk'

/** Support desk: no ticket collection exists yet, so this is an honest empty state, never made-up numbers. */
export function SupportDesk({ description }: { description: string }) {
  return (
    <DeskPage desk="support">
      <PageHeader title="پشتیبانی" subtitle={description} />
      <Panel>
        <EmptyState icon="support" title="این میز هنوز آماده نیست." description="درخواست‌های پشتیبانی پس از راه‌اندازی بخش گفت‌وگو و تیکت اینجا نمایش داده می‌شود. تا آن زمان عددی نشان داده نمی‌شود." />
      </Panel>
    </DeskPage>
  )
}
