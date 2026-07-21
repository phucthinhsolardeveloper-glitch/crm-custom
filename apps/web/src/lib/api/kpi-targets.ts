import { api } from '@/lib/api-client';

/** KPI target 1 user/1 năm. Số dạng string (BigInt/Decimal convention). */
export interface KpiTargetsRecord {
  userId: string;
  year: number;
  targetYearly: string | null;
  targetJan: string | null;
  targetFeb: string | null;
  targetMar: string | null;
  targetApr: string | null;
  targetMay: string | null;
  targetJun: string | null;
  targetJul: string | null;
  targetAug: string | null;
  targetSep: string | null;
  targetOct: string | null;
  targetNov: string | null;
  targetDec: string | null;
  updatedAt: string;
}

export interface KpiTargetsYearItem {
  year: number;
  targetYearly: string | null;
}

export interface KpiActualResponse {
  userId: string;
  year: number;
  yearly: number;
  monthly: Record<number, number>;
}

export interface UpsertKpiTargetsPayload {
  targetYearly?: number | null;
  targetJan?: number | null;
  targetFeb?: number | null;
  targetMar?: number | null;
  targetApr?: number | null;
  targetMay?: number | null;
  targetJun?: number | null;
  targetJul?: number | null;
  targetAug?: number | null;
  targetSep?: number | null;
  targetOct?: number | null;
  targetNov?: number | null;
  targetDec?: number | null;
}

export const kpiTargetsApi = {
  listYears: (userId: string) =>
    api.get<{ data: KpiTargetsYearItem[] }>(`/users/${userId}/kpi-targets`),

  getOne: (userId: string, year: number) =>
    api.get<{ data: KpiTargetsRecord | null }>(`/users/${userId}/kpi-targets/${year}`),

  upsert: (userId: string, year: number, body: UpsertKpiTargetsPayload) =>
    api.put<{ data: KpiTargetsRecord }>(`/users/${userId}/kpi-targets/${year}`, body),

  remove: (userId: string, year: number) =>
    api.delete<{ message: string }>(`/users/${userId}/kpi-targets/${year}`),

  getActual: (userId: string, year: number) =>
    api.get<{ data: KpiActualResponse }>(`/users/${userId}/kpi-actual/${year}`),
};
