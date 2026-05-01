import { Search } from "lucide-react";
import { CostTicker } from "@/components/cost-ticker/CostTicker";

export function TopBar() {
  return (
    <header className="flex h-11 items-center justify-between border-b border-bg-3 bg-bg-1 px-3">
      <div className="flex items-center gap-2 text-sm text-ink-1">
        <span className="text-ink-2">Workspace</span>
        <span className="text-ink-3">/</span>
        <span>Default</span>
      </div>
      <div className="flex items-center gap-3">
        <CostTicker />
        <button
          type="button"
          className="flex items-center gap-2 rounded-md border border-bg-3 bg-bg-2 px-2 py-1 text-xs text-ink-2 hover:border-bg-4 hover:text-ink-1"
        >
          <Search className="h-3 w-3" />
          <span>Search…</span>
          <kbd className="ml-2 rounded border border-bg-4 bg-bg-3 px-1 text-[10px] text-ink-2">
            ⌘K
          </kbd>
        </button>
      </div>
    </header>
  );
}
