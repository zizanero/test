-- AlterTable
ALTER TABLE "Agent" ADD COLUMN "seedKey" TEXT;

-- AlterTable
ALTER TABLE "Run" ADD COLUMN "counterfactualGroupId" TEXT;
ALTER TABLE "Run" ADD COLUMN "perturbationLabel" TEXT;
