import { AppShell } from "@/components/shell/AppShell";
import { TemplatesGallery } from "@/components/templates/TemplatesGallery";
import { prisma } from "@/server/db";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await prisma.template.findMany({ orderBy: { slug: "asc" } });
  return (
    <AppShell currentRoute="/templates">
      <TemplatesGallery
        templates={templates.map((t) => ({
          slug: t.slug,
          title: t.title,
          category: t.category,
          description: t.description,
          attribution: t.attribution,
          readmeMd: t.readmeMd,
        }))}
      />
    </AppShell>
  );
}
