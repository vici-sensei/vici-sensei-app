import type { ReactNode } from "react";
import { FaHouse, FaBook, FaMagnifyingGlass, FaChartColumn } from "react-icons/fa6";

export interface NavItem {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
  icon: ReactNode;
}

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
];
