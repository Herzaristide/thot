"use client";

import { createContext, type ReactNode, useContext } from "react";

export type Role = "corpus:read" | "corpus:review" | "corpus:admin";
export type Viewer = { name: string; email: string; sub: string; roles: Role[] };

const ViewerContext = createContext<Viewer | null>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  const v = useContext(ViewerContext);
  if (!v) throw new Error("useViewer hors de ViewerProvider");
  return v;
}

export function useIsAdmin(): boolean {
  return useViewer().roles.includes("corpus:admin");
}
