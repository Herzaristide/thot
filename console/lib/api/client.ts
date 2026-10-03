import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Client de la Corpus API pour le navigateur : passe par le proxy BFF
 * (/api/corpus/v1/…), qui ajoute le jeton de l'admin côté serveur.
 */
export const api = createClient<paths>({ baseUrl: "/api/corpus" });

export type Problem = {
  title?: string;
  detail?: string;
  status?: number;
  errors?: { loc: string[]; msg: string }[];
  current?: string;
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: Problem | undefined,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
  }
}

/** Déballe une réponse openapi-fetch : lève ApiError si l'API a répondu une erreur. */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.error !== undefined || !res.response.ok) {
    throw new ApiError(res.response.status, res.error as Problem | undefined);
  }
  return res.data as T;
}

/** Message lisible d'une erreur (toasts). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const first = err.problem?.errors?.[0];
    if (first) return `${first.loc.slice(1).join(".")} : ${first.msg}`;
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}
