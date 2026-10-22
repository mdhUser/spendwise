CREATE TABLE "SearchRun" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "startedAt" TIMESTAMP(3) NOT NULL,
 "finishedAt" TIMESTAMP(3) NOT NULL,
 "platformStatus" JSONB NOT NULL
);
CREATE INDEX "SearchRun_conversationId_idx" ON "SearchRun"("conversationId");
CREATE TABLE "SearchEvidence" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "searchRunId" TEXT NOT NULL REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "payload" JSONB NOT NULL
);
CREATE INDEX "SearchEvidence_searchRunId_idx" ON "SearchEvidence"("searchRunId");
ALTER TABLE "Snapshot" ADD COLUMN "searchRunId" TEXT;
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_searchRunId_fkey" FOREIGN KEY ("searchRunId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
