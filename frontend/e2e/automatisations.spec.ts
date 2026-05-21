import { test, expect, account } from "./helpers";

test.describe("Automatisations", () => {
  test("create automation, ingest matching op, confirm webhook fires", async ({
    page,
    seed,
  }) => {
    await seed({
      accounts: [account(1, "Courant")],
      nextId: 50,
    });

    await page.goto("/automatisations");
    await expect(page.getByText("Aucune automatisation").first()).toBeVisible();

    // Create the automation via the UI
    await page.getByRole("button", { name: "Ajouter" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByPlaceholder(/Slack/i).fill("Notify groceries");
    await dialog.getByPlaceholder(/café/i).fill("MARCHÉ");
    await dialog.getByPlaceholder(/n8n/i).fill("https://example.test/hook");
    await dialog.getByRole("button", { name: "Créer" }).click();

    await expect(page.getByText("Notify groceries")).toBeVisible();

    // Ingest two operations: the mock evaluates automations on each insert
    // (mirrors the backend's event-bus subscriber).
    await page.evaluate(() => {
      return window.__TAURI_INTERNALS__.invoke("rpc", {
        method: "import.ingest",
        params: {
          account_id: 1,
          rows: [
            { date: "2026-05-10", montant_cents: -3450, libelle: "MARCHÉ BIO" },
            { date: "2026-05-11", montant_cents: -800, libelle: "Métro" },
          ],
        },
      });
    });

    // Trigger the page's focus-poll to pick up the new pending row.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));

    // Only the matching op enqueues. The pending row references its op id.
    await expect(page.getByText(/op #/i)).toBeVisible();

    // Confirm via the green ✓ button (aria-label = "Valider")
    await page.getByRole("button", { name: "Valider" }).click();

    // Webhook was recorded with the documented payload shape
    type WebhookCall = {
      url: string;
      body: {
        automation: { id: number; name: string };
        event: { type: string; payload: Record<string, unknown> };
      };
    };
    const webhooks = await page.evaluate(
      () => window.__mock.webhooks as unknown as WebhookCall[],
    );
    expect(webhooks).toHaveLength(1);
    expect(webhooks[0].url).toBe("https://example.test/hook");
    expect(webhooks[0].body.automation.name).toBe("Notify groceries");
    expect(webhooks[0].body.event.type).toBe("operation.created");
  });
});
