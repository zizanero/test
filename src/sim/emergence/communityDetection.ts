import Graph from "graphology";
// graphology-communities-louvain ships untyped
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import louvain from "graphology-communities-louvain";

export interface CommunityResult {
  communities: number;
  assignment: Record<string, number>;
  modularity: number;
}

export interface EdgeInput {
  from: string;
  to: string;
  weight: number;
}

export function detectCommunities(
  agentIds: string[],
  edges: EdgeInput[],
): CommunityResult {
  const g = new Graph({ multi: false, type: "undirected" });
  for (const id of agentIds) g.addNode(id);
  for (const e of edges) {
    if (!g.hasNode(e.from) || !g.hasNode(e.to)) continue;
    if (e.from === e.to) continue;
    if (g.hasEdge(e.from, e.to)) {
      g.setEdgeAttribute(e.from, e.to, "weight", Math.max(g.getEdgeAttribute(e.from, e.to, "weight") as number, e.weight));
    } else {
      g.addEdge(e.from, e.to, { weight: Math.max(0.01, Math.abs(e.weight)) });
    }
  }
  if (g.size === 0) {
    const assignment: Record<string, number> = {};
    for (const id of agentIds) assignment[id] = 0;
    return { communities: agentIds.length > 0 ? 1 : 0, assignment, modularity: 0 };
  }
  const result = louvain.detailed(g, { getEdgeWeight: "weight" });
  const assignment = result.communities as Record<string, number>;
  const numCommunities = new Set(Object.values(assignment)).size;
  return {
    communities: numCommunities,
    assignment,
    modularity: result.modularity ?? 0,
  };
}
