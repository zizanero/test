import smallville from "./smallville/spec.json";
import polarization from "./polarization/spec.json";
import vaccination from "./vaccination/spec.json";
import market from "./market/spec.json";
import deliberation from "./deliberation/spec.json";
import laborMarket from "./labor-market/spec.json";
import orgPivot from "./org-pivot/spec.json";
import negotiationBilateral from "./negotiation-bilateral/spec.json";
import communityEvac from "./community-evac/spec.json";
import cubanMissileCrisis from "./cuban-missile-crisis/spec.json";

export interface TemplateSpec {
  slug: string;
  category: string;
  title: string;
  description: string;
  attribution?: string;
  population: PopulationSpec;
  world: WorldSpec;
  rules: RuleSpec[];
  scenario: ScenarioSpec;
  dashboard: { blocks: DashboardBlock[] };
  readmeMd: string;
}

export interface PopulationSpec {
  classes: AgentClassSpec[];
}

export interface AgentClassSpec {
  name: string;
  count: number;
  proseIdentity: string;
  structured?: Record<string, unknown>;
  modelTier?: "auto" | "routine" | "reflection";
  individuals?: { displayName: string; proseIdentity?: string }[];
  initialBeliefs?: Record<string, number>;
  initialGoal?: string;
  initialLocationName?: string;
}

export interface WorldSpec {
  name: string;
  width: number;
  height: number;
  locations: LocationSpec[];
}

export interface LocationSpec {
  name: string;
  kind: "area" | "sub_area" | "object";
  x: number;
  y: number;
  capacity?: number;
  affordances?: string[];
  parentName?: string;
}

export interface RuleSpec {
  name: string;
  triggerKind: "tick" | "predicate" | "manual";
  triggerSpec: { atTick?: number; everyN?: number };
  effect: {
    kind: "inject_observation" | "mutate_ambient" | "spawn_agent" | "message_agent";
    payload?: Record<string, unknown>;
  };
}

export interface ScenarioSpec {
  totalTicks: number;
  fidelity: "cheap" | "balanced" | "high_fidelity";
  defaultSeed: number;
  costCapUsd?: number;
}

export interface DashboardBlock {
  kind: "timeseries" | "distribution" | "network" | "narrative" | "comparison" | "calibration";
  title: string;
  config?: Record<string, unknown>;
}

const templates: TemplateSpec[] = [
  smallville,
  polarization,
  vaccination,
  market,
  deliberation,
  laborMarket,
  orgPivot,
  negotiationBilateral,
  communityEvac,
  cubanMissileCrisis,
] as TemplateSpec[];

export function listTemplates(): TemplateSpec[] {
  return templates;
}

export function getTemplate(slug: string): TemplateSpec | undefined {
  return templates.find((t) => t.slug === slug);
}
