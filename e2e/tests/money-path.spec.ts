import { expect, test } from '@playwright/test'
import { DEMO, fakePhone, login, orderRow, payWithFirstGateway, startCheckout } from './helpers'

const COURSE = 'دوره نمونه مدیریت'

// One student walks the whole money path on the demo tenant; steps depend on each other.
test.describe.configure({ mode: 'serial' })

test.describe('demo tenant money path', () => {
  const phone = fakePhone()

  test('OTP login → 4 instalments + TEST20 → pay two instalments → lesson → logout', async ({ page }) => {
    await test.step('phone OTP login with the dev code on screen', async () => {
      await login(page, DEMO, phone)
      await expect(page.getByTestId('dashboard-greeting')).toContainText('سلام، دانشجوی تست') // profile first name, else the full display name
    })

    await test.step('checkout demo-program, 4 instalments, coupon TEST20', async () => {
      await startCheckout(page, DEMO, 'demo-program', { instalmentsLabel: '۴ قسط', coupon: 'TEST20' })
      expect(new URL(page.url()).origin).toBe(DEMO)
      // 12,000,000 toman − 20% = 9,600,000; 40% down payment = 3,840,000.
      await expect(page.getByText('۳٬۸۴۰٬۰۰۰ تومان')).toBeVisible()
    })

    await test.step('mock gateway success → result page shows partial', async () => {
      await page.getByRole('link', { name: 'پرداخت موفق' }).click()
      await page.waitForURL(`${DEMO}/payments/result?**`)
      expect(new URL(page.url()).searchParams.get('status')).toBe('partial')
      await expect(page.getByRole('heading', { name: 'قسط اول پرداخت شد' })).toBeVisible()
    })

    await test.step('dashboard shows 1 of 4', async () => {
      await page.getByRole('link', { name: 'رفتن به پنل من' }).click()
      await page.waitForURL(`${DEMO}/dashboard`)
      await expect(orderRow(page, COURSE)).toContainText('۱ از ۴')
      await expect(orderRow(page, COURSE)).toContainText('پرداخت قسطی')
    })

    await test.step('pay the next instalment → 2 of 4', async () => {
      await orderRow(page, COURSE).getByRole('link', { name: /^پرداخت/ }).click()
      await page.waitForURL(/\/pay\/\d+$/)
      await payWithFirstGateway(page)
      // Remaining 5,760,000 split into 3.
      await expect(page.getByText('۱٬۹۲۰٬۰۰۰ تومان')).toBeVisible()
      await page.getByRole('link', { name: 'پرداخت موفق' }).click()
      await page.waitForURL(`${DEMO}/payments/result?**`)
      expect(new URL(page.url()).searchParams.get('status')).toBe('partial')
      await page.goto(`${DEMO}/dashboard`)
      await expect(orderRow(page, COURSE)).toContainText('۲ از ۴')
    })

    await test.step('mark a lesson watched', async () => {
      await page.getByRole('link', { name: 'ادامهٔ یادگیری' }).click() // E-028: the dashboard CTA no longer carries the lesson title
      await page.waitForURL(`${DEMO}/learn/demo-program/**`)
      await page.getByRole('button', { name: 'علامت‌گذاری به‌عنوان دیده‌شده' }).click()
      await expect(page.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
      await page.reload()
      await expect(page.getByRole('button', { name: '✓ دیده شد' })).toBeDisabled()
    })

    await test.step('logout', async () => {
      await page.goto(`${DEMO}/dashboard`)
      await page.getByRole('button', { name: 'خروج' }).click()
      await page.waitForURL(`${DEMO}/`)
      await page.goto(`${DEMO}/dashboard`)
      await page.waitForURL(`${DEMO}/login?**`)
    })
  })
})

test('gateway cancel (Status=NOK) shows the failed result page', async ({ page }) => {
  await login(page, DEMO, fakePhone())
  await startCheckout(page, DEMO, 'demo-program')
  await page.getByRole('link', { name: 'انصراف از پرداخت' }).click()
  await page.waitForURL(`${DEMO}/payments/result?**`)
  expect(new URL(page.url()).searchParams.get('status')).toBe('failed')
  await expect(page.getByRole('heading', { name: 'پرداخت انجام نشد' })).toBeVisible()
})
