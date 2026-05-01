import { AppShell } from "@/components/shell/AppShell";
import { HomePage } from "@/components/home/HomePage";

export default function Page() {
  return (
    <AppShell currentRoute="/">
      <HomePage />
    </AppShell>
  );
}
