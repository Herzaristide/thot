import { expect, test } from "@playwright/test";

test("téléphone : barre d'onglets et liseuse immersive", async ({ page }) => {
  await page.goto("/");
  const tabs = page.getByRole("navigation", { name: "Navigation principale" }).last();
  await expect(tabs).toBeVisible();
  await tabs.getByRole("link", { name: "Explorer" }).click();
  await expect(page).toHaveURL(/\/explore/);
  await page
    .getByRole("link", { name: /L’Esprit souterrain/ })
    .first()
    .click();
  await page
    .getByRole("link", { name: /^(Lire|Reprendre)/ })
    .first()
    .click();
  const text = page.locator("article.reader-text p[data-seq]").first();
  await expect(text).toBeVisible();
  // L'interface se masque pendant la lecture, un toucher au centre la rend
  await expect(page.getByRole("banner")).toBeHidden({ timeout: 8000 });
  await text.tap();
  await expect(page.getByRole("banner")).toBeVisible();
});
