// Shared sim types. Engine-internal; the DB stores JSON for some of these.

export type ModelTier = "routine" | "reflection" | "gameMaster";
export type LlmCallKind =
  | "decision"
  | "reflection"
  | "narration"
  | "importance_grade"
  | "interview"
  | "game_master";

export interface AgentRuntime {
  id: string;
  classId: string;
  displayName: string;
  proseIdentity: string;
  structured: Record<string, unknown>;
  beliefs: Record<string, number>;
  goal: string | null;
  currentLocationId: string | null;
  status: "alive" | "dead";
  // Personality vector derived from proseIdentity (deterministic).
  // [openness, conscientiousness, extraversion, agreeableness, neuroticism]
  personality: [number, number, number, number, number];
}

export interface LocationRuntime {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  capacity: number | null;
  affordances: string[];
  parentId: string | null;
}

export interface ActionMenuItem {
  id: string;
  description: string;
  kind: "move" | "speak" | "wait" | "act" | "vote";
  params?: Record<string, unknown>;
  prior?: number; // baseline weight (0..1)
}

export interface DecisionAction {
  kind: ActionMenuItem["kind"];
  params: Record<string, unknown>;
  description: string;
}

export interface DecisionResult {
  reasoning: string;
  reasoningSummary: string;
  retrievedMemoryIds: string[];
  action: DecisionAction;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cached: boolean;
  modelName: string;
  modelTier: ModelTier;
  durationMs: number;
}

export interface RunContext {
  runId: string;
  tick: number;
  totalTicks: number;
  seed: number;
  agents: AgentRuntime[];
  locations: LocationRuntime[];
  occupancy: Map<string, string[]>; // locId → agentIds
  // Topic scalar map per tick — what's "in the air" (for opinion-dynamics templates).
  ambient: Record<string, number>;
  templateSlug: string | null;
  pendingObservations: Map<string, string[]>; // agentId → new observation strings
  lastDecisions: Map<string, DecisionResult>;
  fidelity: "cheap" | "balanced" | "high_fidelity";
  deterministic: boolean;
}

export interface MemoryRow {
  id: string;
  agentId: string;
  tick: number;
  kind: "observation" | "reflection" | "dialogue" | "plan";
  content: string;
  importance: number;
  embedding: number[];
  retrievalCount: number;
  lastRetrievedTick: number | null;
  parentIds?: string[];
}
