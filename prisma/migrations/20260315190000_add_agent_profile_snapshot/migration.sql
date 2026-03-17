CREATE TABLE IF NOT EXISTS "AgentProfileSnapshot" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "soul" TEXT NOT NULL,
  "style" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "memoryAnchor" TEXT NOT NULL,
  "constraints" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentProfileSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentProfileSnapshot_agentId_createdAt_idx"
ON "AgentProfileSnapshot"("agentId", "createdAt");
