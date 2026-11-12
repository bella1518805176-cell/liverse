ALTER TABLE "Contribution"
  ADD COLUMN "contentType" TEXT NOT NULL DEFAULT 'photo',
  ADD COLUMN "eventProposalName" TEXT,
  ADD COLUMN "eventProposalDate" TEXT;
