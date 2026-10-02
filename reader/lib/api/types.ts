import type { components } from "./schema";

/** Types du contrat de la Corpus API (générés par `pnpm gen:api`). */
type S = components["schemas"];

export type WorkSummary = S["WorkSummary"];
export type WorkDetail = S["WorkDetail"];
export type WorkRef = S["WorkRef"];
export type EditionSummary = S["EditionSummary"];
export type EditionDetail = S["EditionDetail"];
export type Author = S["Author"];
export type PersonDetail = S["PersonDetail"];
export type PersonSummary = S["PersonSummary"];
export type MovementNode = S["MovementNode"];
export type MovementDetail = S["MovementDetail"];
export type MovementRef = S["MovementRef"];
export type LanguageCount = S["LanguageCount"];
export type Suggestion = S["Suggestion"];
export type Toc = S["Toc"];
export type TocSection = S["TocSection"];
export type Segment = S["Segment"];
export type SegmentRange = S["SegmentRange"];
export type Note = S["Note"];
export type NoteRef = S["NoteRef"];
export type Position = S["Position"];
export type FindResult = S["FindResult"];
export type FindHit = S["FindHit"];
export type SearchRequest = S["SearchRequest"];
export type SearchResponse = S["SearchResponse"];
export type SearchHit = S["SearchHit"];
export type Counterpart = S["Counterpart"];
export type Parallel = S["Parallel"];
export type ParallelPair = S["ParallelPair"];
export type WorkAlignment = S["WorkAlignment"];
export type Anchor = S["Anchor"];
export type AnchorsResponse = S["AnchorsResponse"];
export type Changes = S["Changes"];
export type Quote = S["Quote"];
export type Page<T> = { items: T[]; next_cursor?: string | null };

/** Problème RFC 9457 renvoyé par l'API. */
export type Problem = {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  current_revision?: number;
};
