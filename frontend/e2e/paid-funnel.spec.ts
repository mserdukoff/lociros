import { expect, test, type Page } from "@playwright/test";

const API = "http://127.0.0.1:8010/api";

function me(status: "trial" | "expired" | "active", extra: Record<string, unknown> = {}) {
  return {
    authenticated: true,
    user_id: 1,
    email: "reader@example.com",
    display_name: "Reader",
    guest: false,
    show_russian: true,
    show_italian: true,
    show_arabic: true,
    require_auth: false,
    generate_remaining: 10,
    created_at: "2026-09-01T00:00:00Z",
    entitlement: {
      status,
      entitled: status !== "expired",
      paywall: true,
      billing_ready: true,
      trial_ends_at: "2026-09-08T00:00:00Z",
      trial_days_left: status === "trial" ? 3 : 0,
      plan: status === "active" ? "annual" : null,
      current_period_end: status === "active" ? "2027-09-08T00:00:00Z" : null,
      cancel_at_period_end: false,
      has_customer: status === "active",
      ...extra,
    },
  };
}

async function mockMe(page: Page, body: unknown) {
  await page.route("**/api/me", (route) =>
    route.request().method() === "GET" ? route.fulfill({ json: body }) : route.fallback(),
  );
}

test.describe("guest", () => {
  test("first passage is free, the second asks for an account", async ({ page, request, context }) => {
    const device = `e2e-${Date.now()}-guest`;
    const headers = { "X-Device-Id": device };
    const library = await (await request.get(`${API}/library?language=ja`, { headers })).json();
    const [first, second] = library.items.map((item: { id: string }) => item.id);
    expect(first && second).toBeTruthy();

    await context.addCookies([{ name: "lociros_device", value: device, url: "http://127.0.0.1:3010" }]);
    await page.addInitScript((id) => window.localStorage.setItem("lociros.device_id", id), device);

    await page.goto(`/passage/${first}`);
    await expect(page.getByRole("heading", { name: /free for \d+ days/i })).toHaveCount(0);

    const rated = await request.post(`${API}/feedback`, {
      headers: { ...headers, "Content-Type": "application/json" },
      data: { passage_id: first, rating: "just_right" },
    });
    expect(rated.ok()).toBeTruthy();

    await page.goto(`/passage/${second}`);
    await expect(page.getByRole("heading", { name: /Keep reading, free for \d+ days/ })).toBeVisible();

    await page.goto(`/passage/${first}`);
    await expect(page.getByRole("heading", { name: /free for \d+ days/i })).toHaveCount(0);
  });

  test("pricing asks a guest to create an account", async ({ page }) => {
    await page.goto("/pricing");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/days, free\./);
    await expect(page.getByRole("radiogroup", { name: "Plan" })).toHaveCount(0);
    await expect(page.getByText("Do I need a card for the free week?")).toBeVisible();
  });
});

test.describe("signed in", () => {
  test("expired trial picks a plan and goes to checkout", async ({ page }) => {
    await mockMe(page, me("expired"));
    let sent: { plan?: string; return_to?: string | null } = {};
    await page.route("**/api/billing/checkout", async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { url: "/billing/success?session_id=cs_test_e2e&next=%2Flibrary" } });
    });

    await page.goto("/pricing?next=%2Flibrary");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your free week is over.");

    const plans = page.getByRole("radiogroup", { name: "Plan" });
    await expect(plans.getByRole("radio", { checked: true })).toContainText(/annual/i);
    await plans.getByRole("radio", { name: /^Monthly/ }).click();
    await expect(plans.getByRole("radio", { name: /^Monthly/ })).toHaveAttribute("aria-checked", "true");

    await page.unroute("**/api/me");
    await mockMe(page, me("active"));
    await page.getByRole("button", { name: "Continue to checkout" }).click();

    await page.waitForURL(/\/billing\/success/);
    expect(sent.plan).toBe("monthly");
    expect(sent.return_to).toBe("/library");
    await expect(page.getByRole("link", { name: /library|keep reading|start/i }).first()).toBeVisible();
  });

  test("canceled checkout says nothing was charged", async ({ page }) => {
    await mockMe(page, me("trial"));
    await page.goto("/pricing?canceled=1");
    await expect(page.getByRole("status")).toHaveText(/Nothing was charged/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/3 days left/);
  });

  test("checkout errors are shown, not swallowed", async ({ page }) => {
    await mockMe(page, me("expired"));
    await page.route("**/api/billing/checkout", (route) =>
      route.fulfill({ status: 503, json: { detail: "Billing is not configured yet." } }),
    );
    await page.goto("/pricing");
    await page.getByRole("button", { name: "Continue to checkout" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(/not configured/);
  });

  test("settings shows the plan and opens the billing portal @phone", async ({ page }) => {
    await mockMe(page, me("active"));
    let portal = false;
    await page.route("**/api/billing/portal", async (route) => {
      portal = true;
      await route.fulfill({ json: { url: "/settings?portal=1" } });
    });
    await page.goto("/settings");
    await expect(page.getByText(/annual/i).first()).toBeVisible();
    await page.getByRole("button", { name: /Manage billing/ }).click();
    await page.waitForURL(/portal=1/);
    expect(portal).toBe(true);
  });
});

test.describe("site", () => {
  test("legal pages, robots, and sitemap are served", async ({ page, request }) => {
    await page.goto("/terms");
    await expect(page.locator("#refunds")).toBeVisible();
    await page.goto("/privacy");
    await expect(page.getByText("Stripe").first()).toBeVisible();

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Sitemap: https://lociros.com/sitemap.xml");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("https://lociros.com/pricing");
  });

  test("the CSP does not block the landing page or the library", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      // Speed Insights is only served on Vercel; locally its script 404s.
      if (text.includes("/_vercel/")) return;
      if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
    });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Start reading|Your shelf/ }).first()).toBeVisible();
    await page.goto("/library");
    await page.waitForLoadState("networkidle");
    expect(violations).toEqual([]);
  });

  test("security headers are set", async ({ request }) => {
    const res = await request.get("/pricing");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["strict-transport-security"]).toContain("max-age=");
  });
});
