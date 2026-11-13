import { expect, test } from '@playwright/test'

test('a new caregiver sets up their profile and the people they care for', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Your name').fill('Maya Alvarez')
  await page.getByLabel('Email').fill(`e2e-setup-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/setup')
  await page.getByLabel('Phone (optional)').fill('(555) 123-4567')
  await page.getByLabel('Time zone').selectOption('America/Chicago')
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page).toHaveURL('/setup/circle')
  await page.getByLabel('Full name').fill('Rose Alvarez')
  await page.getByLabel('Preferred name (optional)').fill('Grandma Rose')
  await page.getByLabel('Date of birth (optional)').fill('1941-03-14')
  await page.getByText('grandparent', { exact: true }).click()
  await expect(page.getByLabel('Name your care circle')).toHaveValue('Alvarez family')
  await page.getByRole('button', { name: 'Create care circle' }).click()

  await expect(page.getByRole('heading', { name: 'Anyone else in Alvarez family?' })).toBeVisible()
  await expect(page.getByText(/Your grandparent · \d+ years old/)).toBeVisible()
  await page.getByRole('button', { name: 'Add another person' }).click()
  await page.getByLabel('Full name').fill('Frank Alvarez')
  await page.getByRole('button', { name: 'Add person' }).click()
  await expect(page.getByRole('list', { name: 'People you care for' }).getByText('Frank Alvarez')).toBeVisible()

  // Setup is finished, so a reload keeps the user on the dashboard.
  await page.getByRole('link', { name: 'Go to your dashboard' }).click()
  await expect(page).toHaveURL('/app')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'A little clarity for your day.' })).toBeVisible()
  await expect(page.getByLabel('Care circle').locator('option:checked')).toHaveText('Alvarez family')
})

test('going back after creating the circle does not offer to create another', async ({ page }) => {
  await page.goto('/register')
  await page.getByLabel('Your name').fill('Maya Alvarez')
  await page.getByLabel('Email').fill(`e2e-setup-back-${Date.now()}@example.com`)
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Full name').fill('Rose Alvarez')
  await page.getByRole('button', { name: 'Create care circle' }).click()
  const people = page.getByRole('heading', { name: 'Anyone else in Alvarez family?' })
  await expect(people).toBeVisible()

  // Step 2 was replaced in history, so Back lands on step 1, and continuing returns to step 3.
  await page.goBack()
  await expect(page).toHaveURL('/setup')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(people).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create care circle' })).toHaveCount(0)
})
