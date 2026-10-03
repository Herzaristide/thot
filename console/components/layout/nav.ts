import {
  Activity,
  BookCopy,
  Database,
  FileUp,
  GitCompareArrows,
  History,
  LayoutDashboard,
  ListChecks,
  type LucideIcon,
  ShieldCheck,
  Tags,
  Trash2,
  Users,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; admin?: boolean };
export type NavGroup = { label: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    label: "Supervision",
    items: [
      { href: "/", label: "Vue d'ensemble", icon: LayoutDashboard, admin: true },
      { href: "/jobs", label: "Tâches", icon: Activity, admin: true },
      { href: "/quality", label: "Qualité", icon: ShieldCheck, admin: true },
      { href: "/indexes", label: "Index et cohérence", icon: Database, admin: true },
      { href: "/events", label: "Historique", icon: History, admin: true },
    ],
  },
  {
    label: "Corpus",
    items: [
      { href: "/upload", label: "Déposer", icon: FileUp, admin: true },
      { href: "/works", label: "Œuvres", icon: BookCopy, admin: true },
      { href: "/persons", label: "Personnes", icon: Users, admin: true },
      { href: "/movements", label: "Courants", icon: Tags, admin: true },
      { href: "/trash", label: "Corbeille", icon: Trash2, admin: true },
    ],
  },
  {
    label: "Alignements",
    items: [
      { href: "/alignment", label: "Atelier", icon: GitCompareArrows },
      { href: "/alignment/review", label: "Vérification", icon: ListChecks },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/alignment")
    return pathname === "/alignment" || /^\/alignment\/[0-9a-f-]{36}/.test(pathname);
  return pathname === href || pathname.startsWith(`${href}/`);
}
