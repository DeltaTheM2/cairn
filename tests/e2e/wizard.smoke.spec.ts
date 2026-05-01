import { expect, test } from "@playwright/test"

const TEST_EMAIL = "playwright-smoke@example.com"

// 300+ chars; passes every PRD-section-1 rule:
//   problem_statement → must_contain_any "engineer" ✓
//   why_now           → min_length 40 ✓
//   elevator_pitch    → must_contain_all "help" ✓ + max 400 ✓
// MockProvider scores by length, so this lands at score 5 (len >= 300).
const ADEQUATE_ANSWER =
  "Engineers at our company need help producing project documentation: today they spend 4-6 hours per project doing it by hand, and the result is inconsistent in structure and detail. When a new engineer or AI agent picks up the project they cannot extract reliable context, so the rework cycle starts over. Current alternatives such as Google Docs templates do not enforce rigor."

test("happy path: auth bypass → project → PRD → first section answered with adequacy scores", async ({
  page,
}) => {
  const signin = await page.request.post("/api/test/sign-in", {
    data: { email: TEST_EMAIL, name: "PW Smoke" },
  })
  expect(signin.status()).toBe(200)
  const body = (await signin.json()) as {
    sessionToken: string
    expiresIso: string
  }

  // Explicitly add the cookie to the BrowserContext jar — Set-Cookie from
  // page.request doesn't reliably carry HttpOnly cookies into page navigation.
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: body.sessionToken,
      domain: "localhost",
      path: "/",
      expires: Math.floor(new Date(body.expiresIso).getTime() / 1000),
      httpOnly: true,
      sameSite: "Lax",
    },
  ])

  // Projects index
  await page.goto("/app/projects")
  await expect(
    page.getByRole("heading", { level: 1, name: "Projects" }),
  ).toBeVisible()

  // Create project
  const projectName = `E2E ${Date.now()}`
  await page.getByRole("button", { name: /new project/i }).click()
  await page.getByLabel("Name").first().fill(projectName)
  await page.getByRole("button", { name: /^Create$/ }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: projectName }),
  ).toBeVisible()

  // Create document
  const docName = `Smoke PRD ${Date.now()}`
  await page.getByRole("button", { name: /new document/i }).click()
  await page.getByLabel("Name").first().fill(docName)
  await page.getByRole("button", { name: /^Create$/ }).click()
  await expect(
    page.getByRole("heading", { level: 1, name: docName }),
  ).toBeVisible()

  // Start wizard
  await page.getByRole("link", { name: /start wizard/i }).click()
  await expect(page.locator("text=/Wizard · /")).toBeVisible()

  // Submit the first two questions and assert the mock judge's score
  // badge renders on each. We deliberately stop short of the third — once
  // section 1 is fully complete, submitAnswer's revalidatePath causes the
  // wizard to auto-advance to section 2 on the next render, swapping the
  // article elements out from under the locators. Two scores is enough
  // proof of life for the rule-check → judge → score → DB write pipeline.
  const articles = page.locator("article")
  const initialCount = await articles.count()
  expect(initialCount).toBeGreaterThanOrEqual(2)

  for (let i = 0; i < 2; i++) {
    const article = articles.nth(i)
    await article.locator("textarea").fill(ADEQUATE_ANSWER)
    await article.locator('button:has-text("Submit")').click()
    await expect(article.locator("text=/[1-5] · /")).toBeVisible({
      timeout: 15_000,
    })
  }
})
