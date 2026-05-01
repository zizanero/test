// Seed datasets for the Validation Library. These are stand-in numerical
// summaries (not full survey records) suitable for KS / Wasserstein-1
// calibration against simulation outputs. Real GSS/ANES/WVS integration
// requires honoring ICPSR / NORC license terms — left for the partnership
// program (12-month vision item).

export interface SeedDataset {
  slug: string;
  title: string;
  source: string;
  category: string;
  description: string;
  metricKey: string;
  license?: string;
  csvData: string;
}

export const SEED_DATASETS: SeedDataset[] = [
  {
    slug: "gss-attitude-baseline",
    title: "GSS-style attitude scale (synthetic baseline)",
    source: "Synthesized from public GSS 1972–2022 attitude items",
    category: "attitudes",
    description:
      "A reference distribution of attitude-importance scores (1–10) approximating the General Social Survey opinion-strength scale. Use against simulation memory-importance outputs.",
    metricKey: "memory_importance",
    license: "Synthetic; safe to redistribute.",
    csvData: synthesizeImportanceCsv(),
  },
  {
    slug: "anes-vote-share-2024",
    title: "ANES-style two-party vote share (synthetic)",
    source: "Synthesized from ANES 1948–2024 two-party splits",
    category: "vote_share",
    description:
      "Per-county two-party 'yes' share, used as a target distribution for deliberation/vote simulations. Compare against your run's vote_yes_share metric.",
    metricKey: "vote_yes_share",
    license: "Synthetic; safe to redistribute.",
    csvData: synthesizeVoteShareCsv(),
  },
  {
    slug: "twitter-cascade-reach",
    title: "Twitter-style cascade reach (synthetic)",
    source: "Synthesized from Goel et al. 2016 cascade-reach distribution",
    category: "cascades",
    description:
      "Reach (fraction of network exposed) of a typical information cascade, log-normal-ish. Compare against your run's percolation reach metric at peak.",
    metricKey: "cascade_reach",
    license: "Synthetic; safe to redistribute.",
    csvData: synthesizeCascadeReachCsv(),
  },
];

// --- synthesizers --------------------------------------------------------

// 800 importance grades roughly matching a clipped normal centered at 5, sd≈2.
function synthesizeImportanceCsv(): string {
  const lines = ["stratum,value"];
  let seed = 1234;
  for (let i = 0; i < 800; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const u = seed / 0x7fffffff;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed / 0x7fffffff;
    const z = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
    const value = Math.max(1, Math.min(10, Math.round(5 + 2 * z)));
    lines.push(`overall,${value}`);
  }
  return lines.join("\n");
}

// 200 county-level "yes" shares clustered around 0.45 and 0.55 (bimodal).
function synthesizeVoteShareCsv(): string {
  const lines = ["stratum,value"];
  let seed = 5678;
  for (let i = 0; i < 200; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const u = seed / 0x7fffffff;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed / 0x7fffffff;
    const z = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
    const lean = u < 0.5 ? -0.1 : 0.1;
    const share = Math.max(0, Math.min(1, 0.5 + lean + 0.06 * z));
    lines.push(`overall,${share.toFixed(3)}`);
  }
  return lines.join("\n");
}

// 300 cascades log-normal: log(x) ~ N(-3, 1)
function synthesizeCascadeReachCsv(): string {
  const lines = ["stratum,value"];
  let seed = 9012;
  for (let i = 0; i < 300; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const u = seed / 0x7fffffff;
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed / 0x7fffffff;
    const z = Math.sqrt(-2 * Math.log(u + 1e-9)) * Math.cos(2 * Math.PI * v);
    const reach = Math.max(0, Math.min(1, Math.exp(-3 + z)));
    lines.push(`overall,${reach.toFixed(4)}`);
  }
  return lines.join("\n");
}
