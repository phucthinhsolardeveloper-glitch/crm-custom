-- CreateEnum
CREATE TYPE "BankAccountDirection" AS ENUM ('THU', 'CHI');

-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "account_holder" TEXT,
ADD COLUMN     "account_number" TEXT,
ADD COLUMN     "bank_name" TEXT,
ADD COLUMN     "direction" "BankAccountDirection" NOT NULL DEFAULT 'THU',
ADD COLUMN     "label" TEXT,
ADD COLUMN     "label_color" TEXT;
