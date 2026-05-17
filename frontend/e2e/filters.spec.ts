import { test, expect, account, category, operation } from "./helpers";

test.describe("Operations filters and search", () => {
  test("search narrows visible rows", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [],
      operations: [
        operation(10, 1, "2025-01-15", -1250, "Supermarché Match"),
        operation(11, 1, "2025-01-18", -800, "Boulangerie du coin"),
        operation(12, 1, "2025-01-20", 200000, "Virement salaire"),
      ],
      nextId: 50,
    });

    await page.goto("/operations");
    await expect(page.getByText(/3 opération/)).toBeVisible();

    // Search for "Supermarché" — only that row remains
    await page.getByPlaceholder(/Rechercher/i).fill("Supermarché");
    await expect(page.getByText("Boulangerie du coin")).not.toBeVisible();
    await expect(page.getByText("Virement salaire")).not.toBeVisible();
    await expect(page.getByText("Supermarché Match")).toBeVisible();

    // Clear search — all 3 rows back
    await page.getByRole("button", { name: "Effacer la recherche" }).click();
    await expect(page.getByText(/3 opération/)).toBeVisible();
    await expect(page.getByText("Boulangerie du coin")).toBeVisible();
    await expect(page.getByText("Virement salaire")).toBeVisible();
  });

  test("date range filter narrows the visible operations", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [],
      operations: [
        operation(10, 1, "2025-01-05", -500, "Janvier début"),
        operation(11, 1, "2025-01-25", -600, "Janvier fin"),
        operation(12, 1, "2025-02-10", -700, "Février dépense"),
      ],
      nextId: 50,
    });

    await page.goto("/operations");
    await expect(page.getByText(/3 opération/)).toBeVisible();

    // Filter from 2025-01-10 — "Janvier début" (01-05) disappears
    await page.getByPlaceholder("Du").fill("2025-01-10");
    await expect(page.getByText("Janvier début")).not.toBeVisible();
    await expect(page.getByText("Janvier fin")).toBeVisible();
    await expect(page.getByText("Février dépense")).toBeVisible();

    // Add upper bound 2025-01-31 — "Février dépense" also disappears
    await page.getByPlaceholder("Au").fill("2025-01-31");
    await expect(page.getByText("Février dépense")).not.toBeVisible();
    await expect(page.getByText("Janvier fin")).toBeVisible();
  });

  test("no-category filter shows only uncategorized operations", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [category(2, "Alimentation")],
      operations: [
        operation(10, 1, "2025-01-15", -1250, "Dépense classée", 2),
        operation(11, 1, "2025-01-18", -800, "Dépense non classée"),
      ],
      nextId: 50,
    });

    await page.goto("/operations");
    await expect(page.getByText(/2 opération/)).toBeVisible();

    // "Sans catégorie" is a <label> toggle, not a button
    await page.locator("label").filter({ hasText: "Sans catégorie" }).click();

    await expect(page.getByText("Dépense classée")).not.toBeVisible();
    // Use the truncate div to match the libelle specifically (not the filter label)
    await expect(page.locator('[title="Dépense non classée"]')).toBeVisible();
  });
});
