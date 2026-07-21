import { CallType } from '@prisma/client';
import { normalizePhone } from '@crm/utils';
import type { OmicallCdrDto } from '../dto/omicall-cdr.dto';

/**
 * Parse + normalize CDR payload tu OmiCall webhook ve shape noi bo.
 * Tach khoi service de unit test duoc khong can Prisma.
 */
export interface InternalCdr {
  callUuid: string;
  phoneNumber: string;
  sipUser: string | null;
  callType: CallType;
  direction: string | null;
  callTime: Date;
  duration: number;
  hangupCause: string | null;
  disposition: string | null;
  endbyName: string | null;
  recordingUrl: string | null;
  omicallUserId: string | null;
  content: string | null;
}

export function parseCdrPayload(dto: OmicallCdrDto): InternalCdr {
  const phone = normalizePhone(dto.phone_number ?? '');
  if (!phone) throw new Error('phone_number missing or invalid');

  return {
    callUuid: dto.call_uuid,
    phoneNumber: phone,
    sipUser: dto.sip_user ?? null,
    callType: resolveCallType(dto.direction, dto.disposition, dto.answer_sec),
    direction: dto.direction ?? null,
    callTime: parseTimestamp(dto.time_start_call) ?? new Date(),
    duration: dto.bill_sec ?? 0,
    hangupCause: dto.hangup_cause ?? null,
    disposition: dto.disposition ?? null,
    endbyName: dto.endby_name ?? null,
    recordingUrl: dto.recording_file_url ?? null,
    omicallUserId: dto.create_by?.id ?? null,
    content: normalizeTranscript(dto.transcript),
  };
}

/**
 * Phan loai cuoc goi:
 * - outbound -> luon OUTGOING
 * - inbound + disposition=answered -> INCOMING
 * - inbound + disposition no_answer/busy/cancel/failed/rejected -> MISSED
 * - inbound + answer_sec > 0 (fallback neu thieu disposition) -> INCOMING
 * - Mac dinh -> MISSED
 */
export function resolveCallType(
  direction?: string,
  disposition?: string,
  answerSec?: number,
): CallType {
  if (direction === 'outbound') return 'OUTGOING';
  const dispo = (disposition ?? '').toLowerCase();
  if (dispo === 'answered') return 'INCOMING';
  if (['no_answer', 'busy', 'cancel', 'failed', 'rejected'].includes(dispo)) return 'MISSED';
  return (answerSec ?? 0) > 0 ? 'INCOMING' : 'MISSED';
}

/**
 * Parse timestamp tu OmiCall (hon hop: seconds 10 digit vs ms 13 digit).
 * Cung ho tro ISO string fallback.
 */
export function parseTimestamp(value: unknown): Date | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    return new Date(ms);
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Trim + coi "" la null. */
export function normalizeTranscript(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
