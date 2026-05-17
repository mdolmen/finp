import { test, expect, account, category, operation } from "./helpers";

test.describe("Bilan", () => {
  test("renders monthly chart with data", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [category(2, "Alimentation")],
      operations: [
        operation(10, 1, "2025-01-15", -5000, "Courses", 2),
        operation(11, 1, "2025-01-20", 200000, "Salaire"),
        operation(12, 1, "2025-02-10", -3000, "Restaurant"),
      ],
      nextId: 50,
    });

    await page.goto("/bilan");

    // Recharts wrapper renders
    await expect(page.locator(".recharts-wrapper")).toBeVisible();

    // Both months appear as axis labels
    await expect(page.getByText(/janv/i).first()).toBeVisible();
    await expect(page.getByText(/févr/i).first()).toBeVisible();

    // KPI section is visible
    await expect(page.getByText("Solde")).toBeVisible();
    await expect(page.getByText("Total revenus")).toBeVisible();
    await expect(page.getByText("Total dépenses")).toBeVisible();
  });

  test("clicking a bar segment opens drilldown with operations", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [category(2, "Alimentation")],
      operations: [
        operation(10, 1, "2025-01-15", -5000, "Supermarché", 2),
        operation(11, 1, "2025-01-20", 200000, "Salaire"),
      ],
      nextId: 50,
    });

    await page.goto("/bilan");
    await expect(page.locator(".recharts-wrapper")).toBeVisible();

    // Recharts renders bar cells as <path class="recharts-rectangle"> inside
    // <g class="recharts-layer recharts-bar-rectangle">. Click the first path.
    await page.locator(".recharts-rectangle").first().click();

    // Drilldown modal title is unique: "janv. 25 — Dépenses" or "janv. 25 — Revenus"
    await expect(page.getByText(/janv\. 25 —/)).toBeVisible();
  });
});
