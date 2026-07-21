-- AlterTable: add triggers_order to labels (when assigned to a lead, auto-open create-order popup)
ALTER TABLE "labels" ADD COLUMN "triggers_order" BOOLEAN NOT NULL DEFAULT false;
