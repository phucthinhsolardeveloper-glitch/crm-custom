/**
 * Payload upsert 1 duong ong Lark (doc lap voi san pham) -> base/table/fieldMap.
 * Body dung string cho BigInt (convention API: BigInt serialize thanh string).
 * Validation nghiep vu (name/tableId rong, catalogKey sai) nam o LarkMappingService.
 */
export interface UpsertLarkMappingDto {
  /** Id duong ong khi cap nhat; bo trong = tao moi. */
  id?: string;
  /** Ten hien thi duong ong (bat buoc). */
  name: string;
  /** Base token rieng; null/undefined = dung LARK_BASE_TOKEN env. */
  baseToken?: string | null;
  /** Lark tableId dich (bat buoc). */
  tableId: string;
  /** { "Ten cot Lark": "catalogKey" } - value phai thuoc CRM_FIELD_CATALOG. */
  fieldMap: Record<string, string>;
  enabled?: boolean;
}
