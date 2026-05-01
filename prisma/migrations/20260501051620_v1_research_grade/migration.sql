-- AlterTable
ALTER TABLE "Simulation" ADD COLUMN "equityStrata" TEXT;

-- CreateTable
CREATE TABLE "Dataset" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "csvData" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "license" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "parentRunId" TEXT,
    "branchedAtTick" INTEGER,
    "counterfactualGroupId" TEXT,
    "perturbationLabel" TEXT,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "seed" INTEGER NOT NULL,
    "totalTicks" INTEGER NOT NULL,
    "currentTick" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME,
    "endedAt" DATETIME,
    "specSnapshot" TEXT NOT NULL,
    "costUsd" REAL NOT NULL DEFAULT 0,
    "costCap" REAL,
    "preregistration" TEXT,
    "narrationVerbosity" TEXT NOT NULL DEFAULT 'terse',
    CONSTRAINT "Run_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Run_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Run" ("branchedAtTick", "costCap", "costUsd", "counterfactualGroupId", "currentTick", "endedAt", "id", "label", "parentRunId", "perturbationLabel", "seed", "simulationId", "specSnapshot", "startedAt", "status", "totalTicks") SELECT "branchedAtTick", "costCap", "costUsd", "counterfactualGroupId", "currentTick", "endedAt", "id", "label", "parentRunId", "perturbationLabel", "seed", "simulationId", "specSnapshot", "startedAt", "status", "totalTicks" FROM "Run";
DROP TABLE "Run";
ALTER TABLE "new_Run" RENAME TO "Run";
CREATE INDEX "Run_simulationId_parentRunId_idx" ON "Run"("simulationId", "parentRunId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
