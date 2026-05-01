import { hash32 } from "./rng";

// Derive a deterministic Big-Five vector from prose identity + agent id.
// Each component in [0,1].
export function derivePersonality(
  agentId: string,
  prose: string,
): [number, number, number, number, number] {
  const text = prose.toLowerCase();
  const cues = {
    openness: /(curious|art|imagin|novel|creative|read|wonder)/.test(text) ? 0.2 : 0,
    conscientious: /(disciplin|organi[sz]ed|reliable|careful|punctual)/.test(text) ? 0.2 : 0,
    extraversion: /(outgoing|social|talkative|gregari|charismatic|loud)/.test(text)
      ? 0.25
      : /(quiet|reserved|shy|introvert|alone|solitary)/.test(text)
      ? -0.2
      : 0,
    agreeable: /(kind|warm|empath|caring|supportive|considerate)/.test(text)
      ? 0.25
      : /(cold|harsh|rude|aggressive|cynical)/.test(text)
      ? -0.2
      : 0,
    neuroticism: /(anxious|worri|stress|nervous|moody|insecure)/.test(text)
      ? 0.3
      : /(calm|steady|even|grounded|secure)/.test(text)
      ? -0.2
      : 0,
  };
  const seedH = hash32(agentId);
  const noise = (k: string) => ((hash32(agentId + ":" + k) % 1000) / 1000) * 0.4 + 0.3;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  return [
    clamp01(noise("o") + cues.openness),
    clamp01(noise("c") + cues.conscientious),
    clamp01(noise("e") + cues.extraversion),
    clamp01(noise("a") + cues.agreeable),
    clamp01(noise("n") + cues.neuroticism),
  ];
}
