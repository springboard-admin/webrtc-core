-- webrtc-core: make chat_messages.pair_id a generic room key (== roomId / call_id),
-- mirroring how call_telemetry.call_id was already decoupled from a FK.
--
-- The core keys in-call chat by roomId, which is NOT necessarily a
-- mentor_student_pairs id (it can be any room, any roles). The original inline
-- FK (chat_messages_pair_id_fkey, ON DELETE CASCADE) blocked inserts for any
-- non-pair room. Drop it so chat works for every consumer/role.
--
-- App impact: none functionally — mentor-spark-link keeps inserting valid pair
-- ids and reading by pair_id. The only change is losing ON DELETE CASCADE
-- cleanup when a pair is deleted; the chat's existing 48h TTL purge (by
-- created_at) already handles old-message cleanup.

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pair_id_fkey;
