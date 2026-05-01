import { LeftSidebar } from "./LeftSidebar";
import { TopBar } from "./TopBar";

interface Props {
  children: React.ReactNode;
  currentRoute: string;
}

export function AppShell({ children, currentRoute }: Props) {
  return (
    <div className="flex h-screen w-screen bg-bg-0 text-ink-0">
      <LeftSidebar currentRoute={currentRoute} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 min-w-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
