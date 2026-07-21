-- AlterTable: add text_color to labels (controls badge foreground color)
ALTER TABLE "labels" ADD COLUMN "text_color" TEXT NOT NULL DEFAULT '#ffffff';
