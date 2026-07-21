import { UserRole } from '@prisma/client';

/**
 * Synthetic actor for system-initiated mutations (cron jobs, BullMQ workers, seed scripts).
 * Runtime-only construct, no DB row. Audit log handlers label these entries as "Hệ thống".
 */
export interface ActorContext {
  id: bigint;
  role: UserRole;
  email?: string;
  departmentId?: bigint | null;
  teamId?: bigint | null;
}

export const SYSTEM_ACTOR: ActorContext = {
  id: 0n,
  role: UserRole.SUPER_ADMIN,
  email: 'system@crm-custom.internal',
};

export function isSystemActor(actor: ActorContext | undefined | null): boolean {
  return actor?.id === 0n;
}
