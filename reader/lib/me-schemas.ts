import { z } from "zod";

/** Corps des routes /api/me (partagés avec le client). */

export const quoteSchema = z.object({
  exact: z.string().max(400),
  prefix: z.string().max(200),
  suffix: z.string().max(200),
});

export const progressPutSchema = z.object({
  workId: z.uuid(),
  revision: z.int().min(1),
  seq: z.int().min(0),
  offset: z.int().min(0).default(0),
  quote: quoteSchema,
  progress: z.number().min(0).max(1),
  sectionPath: z.array(z.string().max(300)).max(10).default([]),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable().default(null),
});

export const collectionCreateSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  emoji: z.string().max(16).nullish(),
  position: z.string().max(64).optional(),
});

export const collectionPatchSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullish(),
  emoji: z.string().max(16).nullish(),
  position: z.string().min(1).max(64).optional(),
});

export const itemPutSchema = z.object({
  position: z.string().min(1).max(64).optional(),
  note: z.string().max(1000).nullish(),
});

export const itemPatchSchema = z.object({
  position: z.string().min(1).max(64).optional(),
  note: z.string().max(1000).nullish(),
});
