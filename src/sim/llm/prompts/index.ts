// Versioned prompt registry. Every LLM call cites a prompt name + version,
// which is pinned into Run.specSnapshot for reproducibility.
//
// Bump the version any time the prompt text or output schema changes.

import type { ActionMenuItem, AgentRuntime } from "@/sim/types";

export interface RenderedPrompt {
  promptName: string;
  promptVersion: string;
  system: string;
  user: string;
}

// --- decision -----------------------------------------------------------

export const DECISION_PROMPT_VERSION = "decision/v1";

export function renderDecisionPrompt(args: {
  agent: AgentRuntime;
  ctx: { tick: number; totalTicks: number; locationName: string };
  recalled: { id: string; content: string }[];
  menu: ActionMenuItem[];
  observations: string[];
}): RenderedPrompt {
  const { agent, ctx, recalled, menu, observations } = args;
  const system = `You are ${agent.displayName}.

Identity: ${agent.proseIdentity}

Current goal: ${agent.goal ?? "(none)"}
Current location: ${ctx.locationName}
Tick: ${ctx.tick} of ${ctx.totalTicks}

Pick the most fitting next action from the menu. Cite memories you relied on with [memory_id]. Do not invent memory IDs that are not in the recalled set.

Output ONLY a JSON object that matches this schema:
{"actionId":"<menu id>","actionKind":"<menu kind>","actionDescription":"<short>","actionParams":{...},"reasoning":"<2-3 sentences with [m] citations>","reasoningSummary":"<one sentence>"}`;

  const userParts: string[] = [];
  if (observations.length > 0) {
    userParts.push(
      "Observations this tick:\n" + observations.map((o) => "- " + o).join("\n"),
    );
  }
  if (recalled.length > 0) {
    userParts.push(
      "Recalled memories:\n" +
        recalled.map((m) => `[${m.id}] ${m.content}`).join("\n"),
    );
  }
  userParts.push(
    "Action menu:\n" +
      menu.map((m) => `- ${m.id}: ${m.description} (kind: ${m.kind})`).join("\n"),
  );
  userParts.push("Return JSON only.");
  return {
    promptName: "decision",
    promptVersion: DECISION_PROMPT_VERSION,
    system,
    user: userParts.join("\n\n"),
  };
}

// --- importance grade ---------------------------------------------------

export const IMPORTANCE_PROMPT_VERSION = "importance/v1";

export function renderImportancePrompt(memoryContent: string): RenderedPrompt {
  return {
    promptName: "importance",
    promptVersion: IMPORTANCE_PROMPT_VERSION,
    system:
      'You grade memory importance from 1 (mundane) to 10 (life-altering). Output JSON ONLY: {"importance":N}.',
    user: `Memory: "${memoryContent}"\nReturn the JSON only.`,
  };
}

// --- reflection ---------------------------------------------------------

export const REFLECTION_PROMPT_VERSION = "reflection/v1";

export function renderReflectionPrompt(args: {
  agentName: string;
  proseIdentity: string;
  memoriesBlock: string;
}): RenderedPrompt {
  return {
    promptName: "reflection",
    promptVersion: REFLECTION_PROMPT_VERSION,
    system: `You are ${args.agentName}. Identity:\n${args.proseIdentity}

Given recent memories, write 3 high-level insights you've drawn from them. Each insight cites 2-3 specific memory IDs. Do not invent memory IDs.

Output ONLY JSON matching this schema:
{"insights":[{"insight":"<sentence>","evidenceMemoryIds":["<id>","<id>"],"importance":<1..10 int>},...]}`,
    user: `Memories from your recent life:\n${args.memoriesBlock}\n\nWhat do you notice? Return JSON only.`,
  };
}

// --- narration ----------------------------------------------------------

export const NARRATION_PROMPT_VERSION = "narration/v1";

export function renderNarrationPrompt(args: {
  tick: number;
  summary: string;
  verbosity: "terse" | "narrative" | "cinematic";
}): RenderedPrompt {
  const styleHint =
    args.verbosity === "cinematic"
      ? "Write 2-3 vivid sentences with concrete details, like the opening of a magazine feature."
      : args.verbosity === "narrative"
      ? "Write 1-2 informative sentences, like a journalist filing a brief."
      : "Write ONE terse sentence summarizing this tick.";
  return {
    promptName: "narration",
    promptVersion: NARRATION_PROMPT_VERSION,
    system: `You are the narrator of an LLM-driven social simulation. ${styleHint}`,
    user: `tick=${args.tick}; events: ${args.summary}`,
  };
}

// --- interview ----------------------------------------------------------

export const INTERVIEW_PROMPT_VERSION = "interview/v1";

export function renderInterviewPrompt(args: {
  agentName: string;
  proseIdentity: string;
  memoriesBlock: string;
  question: string;
}): RenderedPrompt {
  return {
    promptName: "interview",
    promptVersion: INTERVIEW_PROMPT_VERSION,
    system: `You are ${args.agentName}, being interviewed in character.

Identity:
${args.proseIdentity}

You may quote your memories using [memory_id] when relevant. Do not invent memories. Stay in character; speak naturally.`,
    user: `Recent memories you have access to:\n${args.memoriesBlock}\n\nInterviewer asks: ${args.question}\n\nAnswer in character (1-3 sentences):`,
  };
}

// --- causal narrative (analyst-LLM) ------------------------------------

export const CAUSAL_PROMPT_VERSION = "causal/v1";

export function renderCausalPrompt(args: {
  eventDescription: string;
  surroundingNarration: string;
  retrievedMemories: { id: string; content: string }[];
  retrievedAgents: { id: string; name: string; proseIdentity: string }[];
}): RenderedPrompt {
  const memBlock =
    args.retrievedMemories.length > 0
      ? args.retrievedMemories.map((m) => `[${m.id}] ${m.content}`).join("\n")
      : "(no memories retrieved)";
  const agentBlock =
    args.retrievedAgents.length > 0
      ? args.retrievedAgents
          .map((a) => `[${a.id}] ${a.name}: ${a.proseIdentity.slice(0, 200)}`)
          .join("\n")
      : "(no agents listed)";
  const system = `You are a careful analyst examining why an event occurred in an LLM-driven simulation.

Hard rules:
1. Cite every claim with one of: agent IDs [a:<id>], memory IDs [m:<id>], or tick references [t:<n>].
2. If no retrieved memory or agent provides causal evidence for a claim, you MUST say "no causal evidence found in trace" instead of speculating.
3. List but-for causes ranked by confidence (0.0–1.0). Each cause must be falsifiable by perturbation.
4. Output ONLY JSON matching this schema:
{
  "narrative": "<3-5 sentences with [a:..], [m:..], [t:..] citations>",
  "causes": [
    {"label": "<short cause description>", "confidence": <0..1 float>, "evidenceMemoryIds": ["<id>", ...], "evidenceAgentIds": ["<id>", ...], "perturbation": "<concrete what-if>"},
    ...
  ],
  "no_evidence": <true|false>
}`;

  const user = `Event in question:\n${args.eventDescription}\n\nSurrounding narration (±30 ticks):\n${args.surroundingNarration}\n\nRetrieved memories:\n${memBlock}\n\nNeighborhood agents:\n${agentBlock}\n\nReturn JSON only.`;
  return {
    promptName: "causal",
    promptVersion: CAUSAL_PROMPT_VERSION,
    system,
    user,
  };
}

// --- scenario generator (designer-LLM) ---------------------------------

export const SCENARIO_PROMPT_VERSION = "scenario/v1";

export function renderScenarioPrompt(args: {
  description: string;
}): RenderedPrompt {
  const system = `You are a simulation designer. Given a one-paragraph description of a social scenario, produce a runnable Populace simulation specification.

Hard rules:
1. Output ONLY a single JSON object that matches the schema below.
2. Keep it small but interesting: 2–6 agent classes, 2–8 locations, 1–4 rules.
3. Every persona's initialLocationName MUST match a world.locations[].name exactly.
4. totalTicks should be 30–120; default 60.
5. Use kind="area" for top-level locations.
6. Rule effects must be either "inject_observation" (with payload.text + payload.fraction) or "mutate_ambient" (with payload.topic + payload.delta).
7. Every persona's proseIdentity must be 1–3 sentences, in first person or descriptive third person.
8. Pick a category from: "Information", "Markets", "Organizational", "Public health", "Negotiation", "Group decision", "Historical counterfactual".

Schema:
{
  "title": "<short title>",
  "category": "<one of the categories>",
  "description": "<2-3 sentence summary>",
  "population": {
    "classes": [
      {"name": "<class name>", "count": <int>, "proseIdentity": "<persona prose>",
       "initialBeliefs": {<topic>: <-1..1 float>}, "initialGoal": "<short goal>",
       "initialLocationName": "<location name>"}
    ]
  },
  "world": {
    "name": "<world name>", "width": <int 12..30>, "height": <int 8..20>,
    "locations": [
      {"name": "<name>", "kind": "area", "x": <int>, "y": <int>, "capacity": <int|null>}
    ]
  },
  "rules": [
    {"name": "<short>", "triggerKind": "tick", "triggerSpec": {"atTick": <int>},
     "effect": {"kind": "inject_observation"|"mutate_ambient", "payload": {...}}}
  ],
  "scenario": {"totalTicks": <int>, "fidelity": "cheap"|"balanced"|"high_fidelity", "defaultSeed": <int>, "costCapUsd": <float>}
}`;
  const user = `Description: ${args.description}\n\nReturn the JSON only.`;
  return {
    promptName: "scenario",
    promptVersion: SCENARIO_PROMPT_VERSION,
    system,
    user,
  };
}

// --- registry -----------------------------------------------------------

export const PROMPT_VERSIONS = {
  decision: DECISION_PROMPT_VERSION,
  importance: IMPORTANCE_PROMPT_VERSION,
  reflection: REFLECTION_PROMPT_VERSION,
  narration: NARRATION_PROMPT_VERSION,
  interview: INTERVIEW_PROMPT_VERSION,
  causal: CAUSAL_PROMPT_VERSION,
  scenario: SCENARIO_PROMPT_VERSION,
};
