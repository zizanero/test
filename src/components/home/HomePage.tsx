import Link from "next/link";
import { Sparkles } from "lucide-react";

export function HomePage() {
  return (
    <div className="mx-auto max-w-[1280px] px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Populace.
        </h1>
        <p className="mt-1 max-w-2xl text-md text-ink-2">
          A workbench for designing, running, observing, and analyzing
          simulations of LLM-driven generative agents. Describe a population, a
          world, and a question — and watch them play out.
        </p>
      </header>

      <section className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium tracking-tight text-ink-1">
            Pick up where you left off
          </h2>
        </div>
        <div className="rounded-lg border border-dashed border-bg-3 p-8 text-center text-sm text-ink-3">
          No runs yet. Start by instantiating a template.
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <h2 className="text-sm font-medium tracking-tight text-ink-1">
            Starter gallery
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STARTERS.map((s) => (
            <Link
              key={s.slug}
              href={`/templates`}
              className="group block rounded-lg border border-bg-3 bg-bg-1 p-4 transition-colors hover:border-bg-4"
            >
              <div className="mb-2 inline-flex rounded bg-bg-3 px-1.5 py-0.5 text-2xs uppercase tracking-wider text-ink-2">
                {s.category}
              </div>
              <div className="text-md font-medium text-ink-0 group-hover:text-accent-fg">
                {s.title}
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-ink-2">{s.blurb}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

const STARTERS = [
  {
    slug: "smallville",
    category: "Information",
    title: "Smallville (25 agents)",
    blurb:
      "Park et al. 2023 reproduction: Isabella's Valentine's Day cascade. The credibility anchor.",
  },
  {
    slug: "polarization",
    category: "Information",
    title: "Polarization on a network",
    blurb:
      "100-agent stochastic-block community model. Inject a polarizing news article and watch bimodality emerge.",
  },
  {
    slug: "vaccination",
    category: "Public health",
    title: "Vaccination uptake",
    blurb:
      "200 agents with realistic priors. PSA at tick 30, peer-pressure via relationships.",
  },
  {
    slug: "market",
    category: "Markets",
    title: "Double-auction market",
    blurb:
      "60 agents (40 buyers, 20 sellers); GM clears at each tick. Price + transaction history.",
  },
  {
    slug: "deliberation",
    category: "Group decision",
    title: "Citizens' assembly",
    blurb:
      "12-agent deliberation: round-robin → discussion → vote. Watch opinions shift.",
  },
];
