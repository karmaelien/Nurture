import { expect, test, type Page } from '@playwright/test'

const demo = { email: 'demo@nurture.app', password: 'caregiver123' }

async function logIn(page: Page, email: string, password: string) {
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in' }).click()
}

test('registers, keeps the session after reload, logs out, and logs back in', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/register')
  await page.getByLabel('Your name').fill('Daniel Alvarez')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL('/app')
  await expect(page.getByRole('heading', { name: 'A little clarity for your day.' })).toBeVisible()
  await expect(page.getByText(`Signed in as Daniel Alvarez (${email}).`)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'A little clarity for your day.' })).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).click()
  await expect(page).toHaveURL('/login')
  await logIn(page, email, 'password123')
  await expect(page).toHaveURL('/app')
})

test('shows errors for a wrong password and a taken email', async ({ page }) => {
  await page.goto('/login')
  await logIn(page, demo.email, 'not-the-password')
  await expect(page.getByRole('alert')).toContainText("That email and password don't match.")

  await page.getByRole('link', { name: 'Create an account' }).click()
  await page.getByLabel('Your name').fill('Maya')
  await page.getByLabel('Email').fill(demo.email)
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('That email already has an account.', { exact: false })).toBeVisible()
})

test('sends logged-out visitors to login, then on to the app', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL('/login')

  await page.getByRole('button', { name: 'Fill in demo account' }).click()
  await page.getByRole('button', { name: 'Log in' }).click()

  await expect(page).toHaveURL('/app')
  await expect(page.getByText('Signed in as Maya Alvarez (demo@nurture.app).')).toBeVisible()
})
