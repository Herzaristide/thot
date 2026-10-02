/**
 * Base `reader` : données des lecteurs, indexées par le `sub` Keycloak
 * (`user_sub`), jamais par l'identifiant interne de Better Auth.
 * Les tables de Better Auth vivent à part, dans le schéma `auth`.
 */
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { Preferences } from "@/lib/prefs/schema";

const tz = { withTimezone: true } as const;

// ------------------------------------------------------------------ lecteurs

export const preferences = pgTable("preferences", {
  userSub: text("user_sub").primaryKey(),
  // Validé par Zod (schéma versionné `v`) : évolue sans migration
  data: jsonb("data").$type<Preferences>().notNull(),
  updatedAt: timestamp("updated_at", tz).notNull(),
});

export type Quote = { exact: string; prefix: string; suffix: string };

export const readingProgress = pgTable(
  "reading_progress",
  {
    userSub: text("user_sub").notNull(),
    editionId: uuid("edition_id").notNull(),
    workId: uuid("work_id").notNull(),
    revision: integer("revision").notNull(),
    seq: integer("seq").notNull(),
    offset: integer("offset").notNull().default(0),
    quote: jsonb("quote").$type<Quote>().notNull(),
    progress: real("progress").notNull(),
    sectionPath: text("section_path").array(),
    startedAt: timestamp("started_at", tz).notNull(),
    // Horodatage client : « le plus récent gagne » entre appareils
    updatedAt: timestamp("updated_at", tz).notNull(),
    finishedAt: timestamp("finished_at", tz),
  },
  (t) => [
    primaryKey({ columns: [t.userSub, t.editionId] }),
    index("reading_progress_recent").on(t.userSub, t.updatedAt.desc()),
    index("reading_progress_edition").on(t.editionId),
  ],
);

export const favorites = pgTable(
  "favorites",
  {
    userSub: text("user_sub").notNull(),
    workId: uuid("work_id").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userSub, t.workId] })],
);

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userSub: text("user_sub").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    emoji: text("emoji"),
    // Indice fractionnaire : réordonner sans tout réécrire
    position: text("position").notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz).notNull().defaultNow(),
  },
  (t) => [unique("collections_user_name").on(t.userSub, t.name)],
);

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    workId: uuid("work_id").notNull(),
    position: text("position").notNull(),
    note: text("note"),
    addedAt: timestamp("added_at", tz).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.workId] })],
);

export type WorkCacheData = {
  title: string;
  original_title: string;
  first_published_year: number | null;
  authors: { id: string; name: string }[];
  movements: { id: string; slug: string; label: string }[];
  languages: string[];
};

/** Aperçu des œuvres (bibliothèque sans N appels à l'API), rafraîchi par le worker. */
export const workCache = pgTable("work_cache", {
  workId: uuid("work_id").primaryKey(),
  data: jsonb("data").$type<WorkCacheData>().notNull(),
  fetchedAt: timestamp("fetched_at", tz).notNull(),
});

/** Curseurs des flux suivis (/v1/changes). */
export const syncCursors = pgTable("sync_cursors", {
  name: text("name").primaryKey(),
  cursor: text("cursor").notNull(),
  updatedAt: timestamp("updated_at", tz).notNull(),
});

// --------------------------------------------------------- Better Auth (auth)

export const auth = pgSchema("auth");

export const user = auth.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // `sub` Keycloak : clé de toutes les données lecteur
  sub: text("sub").notNull().unique(),
  createdAt: timestamp("created_at", tz).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", tz)
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const session = auth.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", tz).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz)
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id").on(t.userId)],
);

export const account = auth.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", tz),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", tz),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz)
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("account_user_id").on(t.userId)],
);

export const verification = auth.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", tz).notNull(),
    createdAt: timestamp("created_at", tz).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", tz)
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("verification_identifier").on(t.identifier)],
);
