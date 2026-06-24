import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'

const repoRoot = new URL('..', import.meta.url).pathname
const storybookBase = process.env.STORYBOOK_BASE_URL ?? 'http://127.0.0.1:13652'
const docsBase = process.env.DOCS_BASE_URL ?? 'http://127.0.0.1:13651'
const browserExecutable = process.env.PLAYWRIGHT_BROWSER_EXECUTABLE

if (!browserExecutable) {
  throw new Error('PLAYWRIGHT_BROWSER_EXECUTABLE is required')
}

const assetsDir = path.join(
  repoRoot,
  'docs/specs/2br7z-web-pwa-split-identities-offline-shells/assets',
)

const targets = [
  {
    name: 'relay-mesh-public-home.png',
    url: `${storybookBase}/iframe.html?id=public-publichomeherocard--logged-out-with-token&viewMode=story`,
    selector: '.public-home-hero',
    viewport: { width: 1440, height: 1180 },
  },
  {
    name: 'relay-mesh-console-header.png',
    url: `${storybookBase}/iframe.html?id=console-userconsoleheader--light-theme&viewMode=story`,
    selector: '.user-console-header',
    viewport: { width: 1440, height: 520 },
  },
  {
    name: 'relay-mesh-admin-shell.png',
    url: `${storybookBase}/iframe.html?id=admin-adminshell--panel-header-shell&viewMode=story`,
    selector: '.admin-layout',
    viewport: { width: 1440, height: 1180 },
  },
  {
    name: 'relay-mesh-admin-login.png',
    url: `${storybookBase}/iframe.html?id=public-pages-adminlogin--light-theme&viewMode=story`,
    selector: '.auth-shell',
    viewport: { width: 1440, height: 1080 },
  },
  {
    name: 'relay-mesh-registration-paused.png',
    url: `${storybookBase}/iframe.html?id=public-pages-registrationpaused--default&viewMode=story`,
    selector: 'body',
    viewport: { width: 1440, height: 1180 },
  },
  {
    name: 'relay-mesh-docs-site.png',
    url: `${docsBase}/`,
    selector: '.rspress-nav',
    viewport: { width: 1440, height: 900 },
  },
]

await fs.mkdir(assetsDir, { recursive: true })

const browser = await chromium.launch({
  executablePath: browserExecutable,
  headless: true,
})

try {
  const page = await browser.newPage()

  for (const target of targets) {
    await page.setViewportSize(target.viewport)
    await page.goto(target.url, { waitUntil: 'networkidle' })
    await page.locator(target.selector).first().screenshot({
      path: path.join(assetsDir, target.name),
    })
  }
} finally {
  await browser.close()
}
