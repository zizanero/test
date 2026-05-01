import Link from "next/link";
import {
  Home,
  FolderTree,
  LayoutTemplate,
  PinIcon,
  ShieldCheck,
  Receipt,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";

const items = [
  { label: "Home", href: "/", icon: Home },
  { label: "Projects", href: "/projects", icon: FolderTree },
  { label: "Templates", href: "/templates", icon: LayoutTemplate },
  { label: "Boards", href: "/boards", icon: PinIcon },
  { label: "Validation", href: "/validation", icon: ShieldCheck },
  { label: "Cost & Usage", href: "/cost", icon: Receipt },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function LeftSidebar({ currentRoute }: { currentRoute: string }) {
  return (
    <aside className="flex w-[208px] flex-col border-r border-bg-3 bg-bg-1 px-2 py-3">
      <div className="px-2 pb-3">
        <div className="flex items-center gap-2">
          <div className="h-2.5 w-2.5 rounded-sm bg-accent" />
          <span className="text-sm font-semibold tracking-tight">Populace</span>
        </div>
        <div className="mt-0.5 pl-[18px] text-2xs text-ink-3">
          research workspace
        </div>
      </div>
      <nav className="mt-1 flex flex-col gap-0.5">
        {items.map(({ label, href, icon: Icon }) => {
          const active =
            href === "/"
              ? currentRoute === "/"
              : currentRoute.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-ink-1 transition-colors",
                "hover:bg-bg-2 hover:text-ink-0",
                active && "bg-bg-3 text-ink-0",
              )}
            >
              <Icon className="h-3.5 w-3.5 text-ink-2" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 text-2xs text-ink-3">
        <div>v0.1.0 · MVP</div>
      </div>
    </aside>
  );
}
