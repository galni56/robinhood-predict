---
description: Launch the PredictX Vite dev server and drive it with a headless browser to verify a frontend change actually renders. Use whenever asked to run, check, or screenshot the frontend, or to confirm a UI change works before reporting it done.
---

# Running the PredictX frontend

This project has no browser-automation CLI installed on the host (no
`chromium-cli`). Playwright works via `npx` without any project
dependency change — this is the verified path, not a guess.

## 1. Start the dev server

```bash
npm run dev > /tmp/vite_dev.log 2>&1 &
disown
timeout 30 bash -c 'until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done' && echo "SERVER UP"
```

Stop it when done (don't leave it running across sessions):

```bash
netstat -ano | grep ':5173' | awk '{print $5}' | sort -u | while read pid; do taskkill //F //PID "$pid" 2>/dev/null; done
```

(Windows/Git Bash — `lsof` isn't reliably present; `netstat`+`taskkill` is
what actually worked here. `$!` after `npm run dev &` is only the npm
wrapper PID, not the real listener, so killing that alone won't free the
port.)

## 2. Drive it with Playwright (no chromium-cli on this machine)

One-time browser binary install (persists across sessions once done):

```bash
npx --yes playwright install chromium
```

Then a driver script — write to the scratchpad, not the repo:

```js
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
page.on('pageerror', (err) => errors.push(String(err)))

// HashRouter — routes live after the #, e.g. /#/onchain, /#/login, /#/markets
await page.goto('http://localhost:5173/#/onchain', { waitUntil: 'networkidle' })
await page.waitForTimeout(1000) // let wagmi's initial reads resolve

await page.screenshot({ path: 'check.png', fullPage: true })
console.log(await page.locator('body').innerText())
console.log('--- ERRORS ---', errors.length ? errors.join('\n') : '(none)')
await browser.close()
```

Run it from a directory with `playwright` available — either install it
there once (`npm install playwright --no-save`) or run from a scratch
directory that already has it. Check `console --errors`-equivalent
(the `errors` array above) before declaring anything working — a page
can render its shell while every on-chain read fails silently.

## App-specific notes

- Router is `HashRouter` (GitHub Pages has no server rewrite rules) — always
  navigate to `/#/<route>`, a bare path 404s.
- `/onchain` reads the live Robinhood Chain testnet contract directly via
  `wagmi` — no wallet needed to see market data render, only to test the
  connect/bet/claim/refund button flows (which need a real MetaMask/Phantom
  browser profile Playwright's default headless context won't have).
- Every other route requires the mock auth flow first (`/login` with any
  email/password — it's `localStorage`-only, no real backend).
