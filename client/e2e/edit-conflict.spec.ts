import { expect, test } from '@playwright/test'

// Two open edit pages for the same person, as when a relative left one open in another tab.
// The second save must not silently undo the first.
test('a save from an out-of-date edit page does not overwrite newer changes', async ({ page, context }) => {
  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@nurture.app')
  await page.getByLabel('Password', { exact: true }).fill('caregiver123')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'A little clarity for your day.' })).toBeVisible()

  const editPath = '/app/circles/c_demo/people/r_rose/edit'
  const first = page
  const second = await context.newPage()
  await first.goto(editPath)
  await second.goto(editPath)
  await expect(first.getByLabel('Notes (optional)')).toBeVisible()
  await expect(second.getByLabel('Notes (optional)')).toBeVisible()

  // The first page updates the notes.
  const newNotes = 'Started a new blood pressure medication on Monday.'
  await first.getByLabel('Notes (optional)').fill(newNotes)
  await first.getByRole('button', { name: 'Save changes' }).click()
  await expect(first.getByText(newNotes)).toBeVisible()
  // The demo API keeps its data in localStorage, which Chrome syncs between tabs a moment later.
  // Wait until the second tab's API sees the save, as the real server always would.
  await expect
    .poll(() =>
      second.evaluate(() =>
        Object.entries(localStorage).some(
          ([key, value]) => key.startsWith('nurture.mock-db') && value.includes('blood pressure'),
        ),
      ),
    )
    .toBe(true)

  // The second page, still showing the old notes, changes only the preferred name.
  await second.getByLabel('Preferred name (optional)').fill('Nana Rose')
  const saved = second.waitForResponse(
    (response) => response.url().endsWith('/recipients/r_rose') && response.request().method() === 'PATCH',
  )
  await second.getByRole('button', { name: 'Save changes' }).click()
  await saved

  // The first page's notes survive.
  await first.reload()
  await expect(first.getByText(newNotes)).toBeVisible()

  // The second page is told, instead of saving over them, and shows what's saved now where it differs.
  await expect(second.getByText('Someone in the circle changed these details while you were editing.')).toBeVisible()
  await expect(second.getByLabel('Notes (optional)')).toHaveAccessibleDescription(new RegExp(`Saved now: ${newNotes}`))
  await expect(second.getByLabel('Preferred name (optional)')).toHaveAccessibleDescription(/Saved now: Grandma Rose/)

  // Taking the saved version, then redoing this page's change, keeps both.
  await second.getByRole('button', { name: 'Use the saved version' }).click()
  await expect(second.getByLabel('Notes (optional)')).toHaveValue(newNotes)
  await second.getByLabel('Preferred name (optional)').fill('Nana Rose')
  await second.getByRole('button', { name: 'Save changes' }).click()
  await expect(second.getByRole('heading', { name: 'Nana Rose', level: 1 })).toBeVisible()
  await expect(second.getByText(newNotes)).toBeVisible()
})
