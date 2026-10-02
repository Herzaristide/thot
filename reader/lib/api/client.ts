import createClient from "openapi-fetch";
import type { paths } from "./schema";

/**
 * Client de la Corpus API pour le navigateur : passe par le proxy BFF
 * (/api/corpus/v1/…), qui ajoute le jeton côté serveur.
 */
export const api = createClient<paths>({ baseUrl: "/api/corpus" });

export class ApiError extends Error {
  constructor(
    public status: number,
    public problem: { title?: string; detail?: string; current_revision?: number } | undefined,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
  }
}

/** Déballe une réponse openapi-fetch : lève ApiError si l'API a répondu une erreur. */
export function unwrap<T>(res: { data?: T; error?: unknown; response: Response }): T {
  if (res.data === undefined || res.error) {
    throw new ApiError(res.response.status, res.error as ApiError["problem"]);
  }
  return res.data;
}
