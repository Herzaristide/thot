"use client";

import { createContext, type ReactNode, use } from "react";

/** Lecteur connecté, tel que le serveur l'a vu au rendu de la page. */
export type Viewer = { sub: string; name: string; email: string };

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({
  viewer,
  children,
}: {
  viewer: Viewer | null;
  children: ReactNode;
}) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

export function useViewer(): Viewer | null {
  return use(ViewerContext);
}
