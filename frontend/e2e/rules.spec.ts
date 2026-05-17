import { test, expect, account, category, operation } from "./helpers";

test.describe("Rules", () => {
  test("creates a rule and applies it to uncategorized operations", async ({ page, seed }) => {
    await seed({
      accounts: [account(1, "Courant")],
      categories: [category(2, "Alimentation")],
      operations: [
        operation(10, 1, "2025-01-15", -1250, "Supermarché Match"),
        operation(11, 1, "2025-01-18", -800, "Boulangerie du coin"),
        operation(12, 1, "2025-01-20", 200000, "Salaire"),
      ],
      nextId: 50,
    });

    await page.goto("/regles");
    await expect(page.getByText("Aucune règle")).toBeVisible();

    // Open the "Nouvelle règle" dialog
    await page.getByRole("button", { name: "Ajouter" }).click();

    const dialog = page.getByRole("dialog");

    // Name field — labels have no htmlFor; use placeholder
    await dialog.getByPlaceholder(/loyer/i).fill("Grandes surfaces");

    // Category combobox — first combobox in the dialog
    await dialog.getByRole("combobox").first().click();
    await page.getByRole("option", { name: "Alimentation" }).click();

    // Predicate text — input with placeholder "café" (example text)
    await dialog.getByPlaceholder(/café/i).fill("Supermarché");

    await dialog.getByRole("button", { name: "Créer" }).click();

    // Rule appears in list
    await expect(page.getByText("Grandes surfaces")).toBeVisible();

    // Apply rules — 1 operation classified
    await page.getByRole("button", { name: "Appliquer maintenant" }).click();
    await expect(page.getByText(/1 opération/)).toBeVisible();

    // Navigate to Operations — Supermarché should now be categorized
    await page.getByRole("link", { name: "Opérations" }).click();

    const marchéRow = page
      .getByLabel("Sélectionner Supermarché Match")
      .locator("xpath=..");
    await expect(marchéRow.getByRole("combobox")).toContainText("Alimentation");

    // Boulangerie remains uncategorized (shows "—")
    const boulangerieRow = page
      .getByLabel("Sélectionner Boulangerie du coin")
      .locator("xpath=..");
    await expect(boulangerieRow.getByRole("combobox")).toContainText("—");
  });
});
