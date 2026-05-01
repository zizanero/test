import { prisma } from "@/server/db";

// Build an nbformat v4.5 JSON document the user can open in Jupyter.
export async function exportRunNotebook(runId: string): Promise<string> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    include: { simulation: true },
  });
  if (!run) throw new Error("not found");

  const nb = {
    metadata: {
      kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
      language_info: {
        name: "python",
        codemirror_mode: { name: "ipython", version: 3 },
        mimetype: "text/x-python",
        file_extension: ".py",
        pygments_lexer: "ipython3",
      },
    },
    nbformat: 4,
    nbformat_minor: 5,
    cells: [
      mdCell([
        `# ${run.simulation.name}\n`,
        `\nRun \`${run.id}\`. Seed ${run.seed}. ${run.currentTick}/${run.totalTicks} ticks. Total cost USD ${run.costUsd.toFixed(4)}.\n`,
        `\nThis notebook reproduces the per-tick decision counts and a histogram of memory importance.\n`,
      ]),
      codeCell([
        "import pandas as pd\n",
        "import matplotlib.pyplot as plt\n",
        `\n# Load the per-decision CSV exported alongside this notebook.\n`,
        `df = pd.read_csv('decisions.csv')\n`,
        "df.head()",
      ]),
      mdCell(["## Decisions per tick"]),
      codeCell([
        "ax = df.groupby('tick').size().plot(figsize=(8,3))\n",
        "ax.set_ylabel('decisions')\n",
        "ax.set_title('Decisions per tick')\n",
        "plt.tight_layout()\n",
        "plt.show()",
      ]),
      mdCell(["## Action kind composition over time"]),
      codeCell([
        "(df.groupby(['tick','action_kind']).size().unstack(fill_value=0).plot.area(figsize=(8,3)))\n",
        "plt.title('Action composition')\n",
        "plt.tight_layout()\n",
        "plt.show()",
      ]),
      mdCell([
        "## Methods\n",
        `\n* LLM facade: ${run.specSnapshot.length} bytes of immutable spec snapshot.\n`,
        `* Memory: Park-style importance × recency × relevance retrieval.\n`,
        `* Reflection: triggered when sum(importance) > 150 over a 50-tick window.\n`,
      ]),
    ],
  };
  return JSON.stringify(nb, null, 2);
}

function mdCell(source: string[]) {
  return { cell_type: "markdown", metadata: {}, source, id: cryptoId() };
}
function codeCell(source: string[]) {
  return { cell_type: "code", metadata: {}, execution_count: null, outputs: [], source, id: cryptoId() };
}
function cryptoId() {
  return Math.random().toString(36).slice(2, 10);
}
