import { localDb, type OutboxEntry } from "./db";

/**
 * File d'écritures vers /api/me. Toutes les écritures sont idempotentes
 * (PUT/DELETE sur une clé naturelle) : on peut les rejouer sans risque.
 * Une écriture qui échoue faute de réseau attend dans IndexedDB, puis part au
 * retour de la connexion (`online`), au retour sur l'onglet ou au démarrage.
 * Cette file remplace Background Sync, absent de Safari et de Firefox.
 */

type Method = OutboxEntry["method"];

const listeners = new Set<() => void>();

export function onOutboxChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  for (const fn of listeners) fn();
}

async function request(method: Method, url: string, body?: unknown, keepalive = false) {
  return fetch(url, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
    keepalive,
  });
}

/**
 * Envoie une écriture ; si le réseau manque, la met en file (la plus récente
 * pour une même `key` remplace les précédentes).
 */
export async function send(
  method: Method,
  url: string,
  body?: unknown,
  opts: { key?: string; keepalive?: boolean } = {},
): Promise<Response | null> {
  const key = opts.key ?? `${method} ${url}`;
  const db = localDb();
  if (typeof navigator !== "undefined" && !navigator.onLine && db) {
    await enqueue({ key, method, url, body });
    return null;
  }
  try {
    const res = await request(method, url, body, opts.keepalive);
    if (res.status >= 500 && db) await enqueue({ key, method, url, body });
    else if (db) await db.outbox.delete(key);
    return res;
  } catch {
    if (db) await enqueue({ key, method, url, body });
    return null;
  }
}

async function enqueue(e: Pick<OutboxEntry, "key" | "method" | "url" | "body">) {
  const db = localDb();
  if (!db) return;
  await db.outbox.put({ ...e, createdAt: Date.now(), attempts: 0 });
  notify();
}

let flushing: Promise<void> | null = null;

/** Rejoue les écritures en attente, dans l'ordre. */
export function flushOutbox(): Promise<void> {
  flushing ??= doFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function doFlush() {
  const db = localDb();
  if (!db || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const entries = await db.outbox.orderBy("createdAt").toArray();
  for (const e of entries) {
    try {
      const res = await request(e.method, e.url, e.body);
      if (res.status >= 500) {
        await db.outbox.update(e.key, { attempts: e.attempts + 1 });
        break;
      }
      // 2xx, ou 4xx définitif (session expirée, requête invalide) : on retire
      await db.outbox.delete(e.key);
    } catch {
      break; // toujours hors ligne
    }
  }
  notify();
}

export async function pendingCount(): Promise<number> {
  return (await localDb()?.outbox.count()) ?? 0;
}

/** À appeler une fois au démarrage du client. */
export function startOutbox() {
  if (typeof window === "undefined") return () => {};
  const flush = () => void flushOutbox();
  const onVisible = () => document.visibilityState === "visible" && flush();
  window.addEventListener("online", flush);
  document.addEventListener("visibilitychange", onVisible);
  flush();
  return () => {
    window.removeEventListener("online", flush);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
