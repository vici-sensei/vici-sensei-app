import type { ReactNode } from "react";
import { FaHouse, FaBook, FaMagnifyingGlass, FaChartColumn, FaTrophy, FaGear } from "react-icons/fa6";

export interface NavItem {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
  icon: ReactNode;
  danger?: boolean;
}

// Single source of truth for both the desktop sidebar and the mobile full-screen menu --
// every item here always shows in both, regardless of which section the user is in.
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Home",
    isActive: (p) => p === "/dashboard",
    icon: <FaHouse />,
  },
  {
    href: "/study",
    label: "Study",
    isActive: (p) => p.startsWith("/study"),
    icon: <FaBook />,
  },
  {
    href: "/browse/kanji",
    label: "Explore",
    isActive: (p) => p.startsWith("/browse"),
    icon: <FaMagnifyingGlass />,
  },
  {
    href: "/progress",
    label: "Progress",
    isActive: (p) => p.startsWith("/progress"),
    icon: <FaChartColumn />,
  },
  {
    href: "/leaderboard",
    label: "Leaderboard",
    isActive: (p) => p.startsWith("/leaderboard"),
    icon: <FaTrophy />,
  },
  {
    href: "/settings/study",
    label: "Settings",
    isActive: (p) => p.startsWith("/settings"),
    icon: <FaGear />,
  },
];
