import type { Page } from "@playwright/test";
import { test, expect, account, category, operation } from "./helpers";

// Helper: find the operation row div that owns a specific checkbox aria-label.
// The Checkbox button is a direct child of the row div, so `xpath=..` reaches it.
function opRow(page: Page, libelle: string) {
  return page.getByLabel(`Sélectionner ${libelle}`).locator("xpath=..");
}

test.describe("Categorize operations", () => {
  test("assigns category and persists after SPA navigation", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [category(2, "Alimentation")],
      operations: [
        operation(10, 1, "2025-01-15", -1250, "Supermarché Match"),
        operation(11, 1, "2025-01-20", 250000, "Salaire"),
      ],
      nextId: 50,
    });

    await page.goto("/operations");
    await expect(page.getByText(/2 opération/)).toBeVisible();

    // Open the category dropdown for the Supermarché row
    const row = opRow(page, "Supermarché Match");
    await row.getByRole("combobox").click();
    await page.getByRole("option", { name: "Alimentation" }).click();

    // Category now shows in the row
    await expect(row.getByRole("combobox")).toContainText("Alimentation");

    // Navigate away and back — mock state is preserved in-browser
    await page.getByRole("link", { name: "Bilan" }).click();
    await page.getByRole("link", { name: "Opérations" }).click();

    await expect(opRow(page, "Supermarché Match").getByRole("combobox")).toContainText(
      "Alimentation",
    );
  });

  test("bulk-assigns category to multiple operations", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [category(2, "Courses")],
      operations: [
        operation(10, 1, "2025-02-01", -500, "Carrefour"),
        operation(11, 1, "2025-02-03", -800, "Leclerc"),
        operation(12, 1, "2025-02-05", 200000, "Salaire"),
      ],
      nextId: 50,
    });

    await page.goto("/operations");

    // Select Carrefour and Leclerc via their checkboxes
    await page.getByLabel("Sélectionner Carrefour").click();
    await page.getByLabel("Sélectionner Leclerc").click();

    // Bulk-assign Courses via the toolbar dropdown (opens a plain popover, not a listbox)
    await page.getByRole("button", { name: "Assigner catégorie" }).click();
    await page.getByRole("dialog").locator("button").filter({ hasText: "Courses" }).click();

    // Both rows now show Courses
    await expect(opRow(page, "Carrefour").getByRole("combobox")).toContainText("Courses");
    await expect(opRow(page, "Leclerc").getByRole("combobox")).toContainText("Courses");
  });
});
