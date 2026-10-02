import { Compass, House, Library, Search } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "Accueil", icon: House },
  { href: "/explore", label: "Explorer", icon: Compass },
  { href: "/search", label: "Recherche", icon: Search },
  { href: "/library", label: "Bibliothèque", icon: Library },
] as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
