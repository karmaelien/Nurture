import { expect, test } from '@playwright/test'

test('browses the family, edits a person, and updates your own profile', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@nurture.app')
  await page.getByLabel('Password', { exact: true }).fill('caregiver123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'A little clarity for your day.' })).toBeVisible()

  // On phones the Family tab may start scrolled out of view; clicking scrolls it in.
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Family' }).click()
  await expect(page.getByRole('heading', { name: 'Alvarez family' })).toBeVisible()

  // A person: set your own relationship, then edit their details.
  await page.getByRole('link', { name: /Grandma Rose/ }).click()
  await expect(page.getByRole('heading', { name: 'Grandma Rose', level: 1 })).toBeVisible()
  await page.getByText('grandparent', { exact: true }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.getByRole('link', { name: 'Edit' }).click()
  await page.getByLabel('Preferred name (optional)').fill('Nana Rose')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('heading', { name: 'Nana Rose', level: 1 })).toBeVisible()

  // Another caregiver, then back to the family list, which shows the changes.
  await page.getByRole('link', { name: 'Alvarez family' }).click()
  await expect(page.getByRole('link', { name: /Nana Rose · Rose Alvarez Your grandparent/ })).toBeVisible()
  await page.getByRole('link', { name: /Daniel Alvarez/ }).click()
  await expect(page.getByRole('link', { name: 'Call Daniel' })).toHaveAttribute('href', 'tel:5550104455')

  // Your own profile, from the header.
  await page.getByRole('link', { name: 'Maya, my profile' }).click()
  await page.getByLabel('Phone (optional)').fill('(555) 222-3333')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Phone (optional)')).toHaveValue('(555) 222-3333')
})
