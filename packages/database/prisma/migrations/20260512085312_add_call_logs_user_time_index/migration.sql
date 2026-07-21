-- Index hỗ trợ aggregation per-user trong dashboard employee call report
-- Filter: WHERE matched_user_id = ... AND call_time BETWEEN ... AND ...
-- Đã có index (matched_entity_type, matched_entity_id, call_time) cho untouched query.
CREATE INDEX IF NOT EXISTS "call_logs_matched_user_id_call_time_idx"
  ON "call_logs" ("matched_user_id", "call_time")
  WHERE "matched_user_id" IS NOT NULL;
