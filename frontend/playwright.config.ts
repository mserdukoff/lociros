import { defineConfig, devices } from "@playwright/test";

// Runs the real FastAPI app on SQLite with the paywall on, and `next start`
// against it. Stripe and Supabase are not involved; tests that need a signed-in
// account mock /api/me and /api/billing/* in the browser.
const API_PORT = 8010;
const WEB_PORT = 3010;
const python = process.env.E2E_PYTHON ?? ".venv/bin/python";
const db = "/tmp/lociros-e2e.db";
const startWeb = `npx next start -p ${WEB_PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "retain-on-failure",
    // The production build registers /sw.js, and page.route cannot see
    // requests a service worker answers.
    serviceWorkers: "block",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
  ],
  webServer: [
    {
      command: `rm -f ${db} && ${python} -m uvicorn app.main:app --port ${API_PORT}`,
      cwd: "../backend",
      url: `http://127.0.0.1:${API_PORT}/health`,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        APP_ENV: "development",
        DATABASE_URL: `sqlite:///${db}`,
        PAYWALL_ENABLED: "true",
        FREE_GUEST_PASSAGES: "1",
        NEWS_SCHEDULER: "false",
        OPENROUTER_API_KEY: "",
        CORS_ORIGINS: `http://127.0.0.1:${WEB_PORT}`,
      },
    },
    {
      command: process.env.E2E_SKIP_BUILD ? startWeb : `npx next build && ${startWeb}`,
      url: `http://127.0.0.1:${WEB_PORT}/health`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NLP_BACKEND_URL: `http://127.0.0.1:${API_PORT}`,
        NEXT_PUBLIC_SITE_URL: "https://lociros.com",
      },
    },
  ],
});
