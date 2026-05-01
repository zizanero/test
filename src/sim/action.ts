import type { AgentRuntime, DecisionAction, RunContext } from "./types";

// Apply an agent's chosen action to the world. Returns a short observation
// describing what happened, which is fed back into the agent's memory.
export function applyAction(
  agent: AgentRuntime,
  action: DecisionAction,
  ctx: RunContext,
): { observationForSelf: string; observationsForOthers: Map<string, string> } {
  const others = new Map<string, string>();
  let selfObs = "";

  switch (action.kind) {
    case "move": {
      const newLocId = String(action.params.locationId ?? "");
      const target = ctx.locations.find((l) => l.id === newLocId);
      if (target) {
        // Update occupancy
        if (agent.currentLocationId) {
          const arr = ctx.occupancy.get(agent.currentLocationId) ?? [];
          ctx.occupancy.set(
            agent.currentLocationId,
            arr.filter((id) => id !== agent.id),
          );
        }
        agent.currentLocationId = newLocId;
        const arr = ctx.occupancy.get(newLocId) ?? [];
        if (!arr.includes(agent.id)) arr.push(agent.id);
        ctx.occupancy.set(newLocId, arr);
        selfObs = `I went to ${target.name}.`;
      } else selfObs = `I tried to move but couldn't.`;
      break;
    }
    case "speak": {
      const peerId = String(action.params.peerId ?? "");
      const peer = ctx.agents.find((a) => a.id === peerId);
      if (peer) {
        selfObs = `I spoke with ${peer.displayName}: "${action.description}"`;
        others.set(
          peer.id,
          `${agent.displayName} spoke with me: "${action.description}"`,
        );
      } else selfObs = `I tried to speak but no one was there.`;
      break;
    }
    case "wait":
      selfObs = `I waited and observed.`;
      break;
    case "act":
      selfObs = `I acted: ${action.description}.`;
      break;
    case "vote": {
      const choice = String(action.params.choice ?? "abstain");
      // Tally lives in ambient under topic "vote_yes"/"vote_no"
      const key = `vote_${choice}`;
      ctx.ambient[key] = (ctx.ambient[key] ?? 0) + 0.05;
      selfObs = `I voted ${choice}.`;
      break;
    }
  }
  return { observationForSelf: selfObs, observationsForOthers: others };
}
