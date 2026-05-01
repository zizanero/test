-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Simulation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateSlug" TEXT,
    "spec" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "provenance" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Simulation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Population" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "Population_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentClass" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "populationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "proseIdentity" TEXT NOT NULL,
    "structured" TEXT NOT NULL,
    "modelTier" TEXT NOT NULL DEFAULT 'auto',
    CONSTRAINT "AgentClass_populationId_fkey" FOREIGN KEY ("populationId") REFERENCES "Population" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "classId" TEXT NOT NULL,
    "runId" TEXT,
    "displayName" TEXT NOT NULL,
    "proseIdentity" TEXT NOT NULL,
    "structured" TEXT NOT NULL,
    "currentLocationId" TEXT,
    "beliefs" TEXT NOT NULL DEFAULT '{}',
    "goal" TEXT,
    "status" TEXT NOT NULL DEFAULT 'alive',
    "spawnTick" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Agent_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AgentClass" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Agent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Agent_currentLocationId_fkey" FOREIGN KEY ("currentLocationId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    CONSTRAINT "World_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "worldId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "capacity" INTEGER,
    "affordances" TEXT,
    CONSTRAINT "Location_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Location_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Location" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RuleEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerKind" TEXT NOT NULL,
    "triggerSpec" TEXT NOT NULL,
    "effect" TEXT NOT NULL,
    CONSTRAINT "RuleEvent_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RuleCondition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    CONSTRAINT "RuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "RuleEvent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Run" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "simulationId" TEXT NOT NULL,
    "parentRunId" TEXT,
    "branchedAtTick" INTEGER,
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
    CONSTRAINT "Run_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Run_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "Run" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tick" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "narration" TEXT,
    "emergence" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tick_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "importance" REAL NOT NULL,
    "embedding" TEXT NOT NULL,
    "retrievalCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetrievedTick" INTEGER,
    "parentIds" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Memory_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Memory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Decision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "retrievedMemoryIds" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelTier" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "reasoningSummary" TEXT,
    "action" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costUsd" REAL NOT NULL,
    "cached" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL,
    CONSTRAINT "Decision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Decision_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Reflection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "insight" TEXT NOT NULL,
    "evidenceMemoryIds" TEXT NOT NULL,
    "parentReflectionId" TEXT,
    "importance" REAL NOT NULL,
    CONSTRAINT "Reflection_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Reflection_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Relationship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "fromAgentId" TEXT NOT NULL,
    "toAgentId" TEXT NOT NULL,
    "weight" REAL NOT NULL,
    "kind" TEXT NOT NULL,
    "lastUpdatedTick" INTEGER NOT NULL,
    CONSTRAINT "Relationship_fromAgentId_fkey" FOREIGN KEY ("fromAgentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Relationship_toAgentId_fkey" FOREIGN KEY ("toAgentId") REFERENCES "Agent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CostLedger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "agentId" TEXT,
    "modelName" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "costUsd" REAL NOT NULL,
    "cached" BOOLEAN NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CostLedger_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Marker" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "tick" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data" TEXT,
    CONSTRAINT "Marker_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HotCue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "pad" INTEGER NOT NULL,
    "tick" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    CONSTRAINT "HotCue_runId_fkey" FOREIGN KEY ("runId") REFERENCES "Run" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "slug" TEXT NOT NULL PRIMARY KEY,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "attribution" TEXT,
    "spec" TEXT NOT NULL,
    "dashboard" TEXT NOT NULL,
    "readmeMd" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Board" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "items" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Agent_runId_idx" ON "Agent"("runId");

-- CreateIndex
CREATE INDEX "Run_simulationId_parentRunId_idx" ON "Run"("simulationId", "parentRunId");

-- CreateIndex
CREATE INDEX "Tick_runId_index_idx" ON "Tick"("runId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "Tick_runId_index_key" ON "Tick"("runId", "index");

-- CreateIndex
CREATE INDEX "Memory_agentId_tick_idx" ON "Memory"("agentId", "tick");

-- CreateIndex
CREATE INDEX "Decision_agentId_tick_idx" ON "Decision"("agentId", "tick");

-- CreateIndex
CREATE INDEX "Decision_runId_tick_idx" ON "Decision"("runId", "tick");

-- CreateIndex
CREATE INDEX "Reflection_agentId_tick_idx" ON "Reflection"("agentId", "tick");

-- CreateIndex
CREATE UNIQUE INDEX "Relationship_runId_fromAgentId_toAgentId_key" ON "Relationship"("runId", "fromAgentId", "toAgentId");

-- CreateIndex
CREATE INDEX "CostLedger_runId_tick_idx" ON "CostLedger"("runId", "tick");
