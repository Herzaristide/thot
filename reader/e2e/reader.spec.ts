import { expect, type Page, test } from "@playwright/test";

const WORK = "L’Esprit souterrain";

async function openWork(page: Page) {
  await page.goto("/explore");
  await page
    .getByRole("link", { name: new RegExp(WORK) })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1, name: WORK })).toBeVisible();
}

async function openReader(page: Page) {
  await openWork(page);
  await page
    .getByRole("link", { name: /^(Lire|Reprendre)/ })
    .first()
    .click();
  await page.waitForURL(/\/read\//);
  await expect(page.locator("[data-ready] article.reader-text p[data-seq]").first()).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("catalogue : filtres, fiche d'œuvre, éditions", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("link", { name: /Crime et Châtiment/ }).first()).toBeVisible();
  await page.getByRole("combobox", { name: "Auteur" }).click();
  await page.getByRole("option", { name: "Victor Hugo" }).click();
  await expect(page).toHaveURL(/author=/);
  await expect(page.getByRole("link", { name: /Les Misérables/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Crime et Châtiment/ })).toHaveCount(0);

  await openWork(page);
  await expect(page.getByRole("heading", { name: "Éditions et traductions" })).toBeVisible();
  await expect(page.getByText("Original").first()).toBeVisible();
});

test("palette ⌘K : suggestion d'œuvre", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder("Œuvre, auteur, citation…").fill("misérables");
  await page.getByRole("option", { name: /Les Misérables/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Les Misérables" })).toBeVisible();
});

test("favori et collection", async ({ page }) => {
  await openWork(page);
  await page.getByRole("button", { name: "Ajouter aux favoris" }).click();
  await expect(page.getByRole("button", { name: "Retirer des favoris" })).toBeVisible();

  await page.getByRole("button", { name: "Collection" }).click();
  await page.getByLabel("Nom de la nouvelle collection").fill("Russes");
  await page.getByRole("button", { name: "Créer" }).click();
  await expect(page.getByText("Ajoutée à « Russes »")).toBeVisible();

  await page.goto("/library?tab=favorites");
  await expect(page.getByRole("link", { name: new RegExp(WORK) })).toBeVisible();
  await page.goto("/library?tab=collections");
  await page.getByRole("link", { name: /Russes/ }).click();
  await expect(page.getByRole("heading", { name: "Russes" })).toBeVisible();
  await expect(page.getByText(WORK).first()).toBeVisible();
});

test("liseuse : réglages, chapitres, table des matières, recherche", async ({ page }) => {
  await openReader(page);
  const text = page.locator("article.reader-text");

  // Réglages « Aa » appliqués en direct
  await page.mouse.move(10, 10);
  await page.getByRole("button", { name: "Réglages d'affichage" }).click();
  await page.getByRole("button", { name: "Plus grand" }).click();
  await page.getByRole("radio", { name: "Sépia" }).click();
  await expect(page.locator("html")).toHaveClass(/sepia/);
  await page.keyboard.press("Escape");

  // Table des matières → chapitre II de la première partie
  await page.getByRole("button", { name: "Table des matières" }).click();
  await page
    .getByRole("navigation", { name: "Table des matières" })
    .getByRole("button", { name: "II", exact: true })
    .first()
    .click();
  await expect(page.getByRole("banner")).toContainText("II");
  await expect(text).toBeVisible();

  // Recherche dans le livre
  await page.getByRole("button", { name: "Chercher dans le livre" }).click();
  await page.getByPlaceholder("Mots, expression…").fill("Ordinov");
  await page.getByRole("dialog").getByRole("button").filter({ hasText: "Ordinov" }).first().click();
  await expect(text.getByText("Ordinov").first()).toBeVisible();
});

test("liseuse : la progression est reprise", async ({ page }) => {
  await openReader(page);
  // Va au chapitre suivant puis défile
  const first = page.locator("article p[data-seq]").first();
  const before = await first.getAttribute("data-seq");
  await expect(async () => {
    await page.getByRole("button", { name: /Suite/ }).click();
    await expect(first).not.toHaveAttribute("data-seq", before ?? "", { timeout: 2000 });
  }).toPass({ timeout: 10_000 });
  // Envoi périodique (toutes les ~5 s)
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/me/progress/") && r.request().method() === "PUT" && r.ok(),
    { timeout: 15_000 },
  );
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(800);
  const seq = await page.evaluate(() => {
    const p = [...document.querySelectorAll<HTMLElement>("article p[data-seq]")].find(
      (e) => e.getBoundingClientRect().bottom > 64,
    );
    return Number(p?.dataset.seq);
  });
  await saved;
  await page.goto("/library");
  await expect(page.getByRole("link", { name: new RegExp(WORK) }).first()).toBeVisible();
  await page
    .getByRole("link", { name: new RegExp(WORK) })
    .first()
    .click();
  await page.waitForURL(/\/read\//);
  await expect(page.locator(`article p[data-seq="${seq}"]`)).toBeInViewport();
});

test("liseuse : mode pages", async ({ page }) => {
  await openReader(page);
  await page.getByRole("button", { name: "Réglages d'affichage" }).click();
  await page.getByRole("radio", { name: "Pages" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const indicator = page.getByText(/^\d+ \/ \d+$/);
  await expect(indicator).toBeVisible();
  const before = await indicator.textContent();
  // Page suivante, ou chapitre suivant si celui-ci tient sur une page
  await page.keyboard.press("ArrowRight");
  await expect(indicator).not.toHaveText(before ?? "");
  await expect(page.locator(".reader-paged p[data-seq]").first()).toBeVisible();
  // Retour au défilement pour les tests suivants
  await page.getByRole("button", { name: "Réglages d'affichage" }).click();
  await page.getByRole("radio", { name: "Défilement" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("article.reader-text")).toBeVisible();
});

test("liseuse : lecture parallèle et changement de traduction", async ({ page }) => {
  // L'édition anglaise est bien alignée sur l'original russe (la française, une adaptation, très peu)
  await openWork(page);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Anglais" })
    .getByRole("link", { name: /Lire|Reprendre/ })
    .click();
  await page.waitForURL(/\/read\//);
  await page.locator("[data-ready]").waitFor();
  await page.getByRole("button", { name: "Chapitre suivant" }).click();
  await page.getByRole("button", { name: "Langues et traductions" }).click();
  await page.getByRole("menuitem", { name: "Avec Russe" }).click();
  await expect(page.locator("[data-parallel-target] p[data-seq]").first()).toBeVisible();
  await expect(page.locator("[data-parallel-target]").first()).toHaveAttribute("lang", "ru");

  await page.getByRole("button", { name: "Langues et traductions" }).click();
  await page.getByRole("menuitem", { name: "Désactivée" }).click();
  await page.getByRole("button", { name: "Langues et traductions" }).click();
  await page.getByRole("menuitem", { name: /Russe/ }).first().click();
  await page.waitForURL(/\/read\/.+\?seq=\d+/);
  await expect(page.locator("article.reader-text")).toHaveAttribute("lang", "ru");
});

test("liseuse : lecture parallèle en mode pages", async ({ page }) => {
  await openWork(page);
  await page
    .getByRole("listitem")
    .filter({ hasText: "Anglais" })
    .getByRole("link", { name: /Lire|Reprendre/ })
    .click();
  await page.waitForURL(/\/read\//);
  await page.locator("[data-ready]").waitFor();
  await page.getByRole("button", { name: "Chapitre suivant" }).click();
  await page.getByRole("button", { name: "Langues et traductions" }).click();
  await page.getByRole("menuitem", { name: "Avec Russe" }).click();
  await page.getByRole("button", { name: "Réglages d'affichage" }).click();
  await page.getByRole("radio", { name: "Pages" }).click();
  await page.keyboard.press("Escape");

  // Les deux textes sont paginés ensemble
  await expect(
    page.locator(".reader-paged [data-parallel-target] p[data-seq]").first(),
  ).toBeVisible();
  await expect(page.locator(".reader-paged [data-parallel-target]").first()).toHaveAttribute(
    "lang",
    "ru",
  );
  // Pagination refaite une fois la traduction chargée : plusieurs pages, on tourne la page
  // (pages de titre d'une seule page : on avance jusqu'à un vrai chapitre)
  const indicator = page.getByText(/^\d+ \/ \d+$/);
  await expect(async () => {
    if ((await indicator.textContent()) === "1 / 1") await page.keyboard.press("ArrowRight");
    await expect(indicator).toHaveText(/^1 \/ ([2-9]|\d{2,})$/, { timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press("ArrowRight");
  await expect(indicator).toHaveText(/^2 \/ /);

  // Retour au défilement, sans lecture parallèle, pour les tests suivants
  await page.getByRole("button", { name: "Réglages d'affichage" }).click();
  await page.getByRole("radio", { name: "Défilement" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Langues et traductions" }).click();
  // Préférences envoyées après ~800 ms : on attend l'envoi avant de fermer la page
  const saved = page.waitForResponse(
    (r) => r.url().includes("/api/me/preferences") && r.request().method() === "PUT" && r.ok(),
  );
  await page.getByRole("menuitem", { name: "Désactivée" }).click();
  await expect(page.locator("[data-parallel-target]")).toHaveCount(0);
  await saved;
});

test("hors ligne : un livre téléchargé reste lisible", async ({ page, context }) => {
  await openReader(page);
  // Attend que le service worker contrôle la page
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.locator("[data-ready] article.reader-text p[data-seq]").first()).toBeVisible();
  await page.getByRole("button", { name: "Télécharger pour lire hors ligne" }).click();
  await expect(page.getByText("Livre disponible hors ligne")).toBeVisible({ timeout: 30_000 });

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("[data-ready] article.reader-text p[data-seq]").first()).toBeVisible();
  // Un autre chapitre, jamais ouvert, vient d'IndexedDB
  await page.getByRole("button", { name: /Suite/ }).click();
  await expect(page.locator("article.reader-text p[data-seq]").first()).toBeVisible();
  await context.setOffline(false);
});
