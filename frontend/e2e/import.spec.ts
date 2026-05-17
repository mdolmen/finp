import path from "path";
import { fileURLToPath } from "url";
import { test, expect, account } from "./helpers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV = path.join(__dirname, "test.csv");

test.describe("CSV import", () => {
  test("imports 2 rows then deduplicates on re-import", async ({ page, seed }) => {
    await seed({ accounts: [account(1, "Mon compte")], nextId: 10 });
    await page.goto("/comptes");

    // Open import dialog for Mon compte
    const row = page.getByRole("listitem").filter({ hasText: "Mon compte" });
    await row.getByRole("button", { name: "Importer" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Upload CSV — file input is sr-only inside the drop label
    await page.locator('input[type="file"]').setInputFiles(CSV);

    // MappingStep: auto-detects date/montant/libelle columns; click Valider
    await expect(dialog.getByRole("button", { name: "Valider" })).toBeVisible();
    await dialog.getByRole("button", { name: "Valider" }).click();

    // PreviewStep: 2 valid rows
    await expect(dialog.getByText("2")).toBeVisible();
    await dialog.getByRole("button", { name: "Importer" }).click();

    // DoneStep: 2 imported, 0 skipped
    await expect(dialog.getByText("Importées :")).toBeVisible();
    const importedCount = dialog.locator("li").filter({ hasText: "Importées :" });
    await expect(importedCount).toContainText("2");
    await dialog.getByRole("button", { name: "Fermer" }).click();

    // Navigate to Operations — 2 rows visible
    await page.getByRole("link", { name: "Opérations" }).click();
    await expect(page.getByText(/2 opération/)).toBeVisible();

    // Re-import the same file → both rows deduplicated
    await page.getByRole("link", { name: "Comptes" }).click();
    await page.getByRole("listitem").filter({ hasText: "Mon compte" }).getByRole("button", { name: "Importer" }).click();
    await page.locator('input[type="file"]').setInputFiles(CSV);
    await page.getByRole("dialog").getByRole("button", { name: "Valider" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Importer" }).click();

    const skippedRow = page.getByRole("dialog").locator("li").filter({ hasText: "Doublons ignorés :" });
    await expect(skippedRow).toContainText("2");
    await page.getByRole("dialog").getByRole("button", { name: "Fermer" }).click();
  });
});
