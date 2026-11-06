import { expect, test } from '@playwright/test'
import { DEMO, IBA } from './helpers'

test('lowercase Persian-digit certificate code is valid on demo', async ({ page }) => {
  await page.goto(`${DEMO}/verify?code=${encodeURIComponent('ed-mgt-۰۰۱')}`)
  await expect(page.getByText('✓ این گواهی معتبر است')).toBeVisible()
  await expect(page.getByText('ED-MGT-001', { exact: true })).toBeVisible()
})

test('demo certificate is not found on iba', async ({ page }) => {
  await page.goto(`${IBA}/verify?code=ED-MGT-001`)
  await expect(page.getByText('گواهی‌ای با این کد پیدا نشد.')).toBeVisible()
  await expect(page.getByText('این گواهی معتبر است')).toHaveCount(0)
})

test('demo course is a 404 on iba', async ({ page }) => {
  const res = await page.goto(`${IBA}/courses/demo-program`)
  expect(res?.status()).toBe(404)
})
