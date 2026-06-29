-- webrtc-core: make chat_messages identity-agnostic, matching the rest of the
-- generic layer (call_telemetry.participant_id / call_participants.participant_id
-- are TEXT; roles are free strings).
--
-- chat_messages was built mentor/student-specific:
--   sender_id  uuid            -> the core uses an opaque participant id (e.g. a
--                                 Canvas userId like "1118"), which isn't a uuid.
--   sender_role CHECK in (...)  -> rejects coach/advisor/etc.
--
-- App impact: none. mentor-spark-link inserts uuid-strings (valid TEXT) and only
-- ever uses 'mentor'/'student'; chat logic keys off sender_role equality, not
-- sender_id type, and there is no FK/index on sender_id.

ALTER TABLE public.chat_messages ALTER COLUMN sender_id TYPE text USING sender_id::text;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_role_check;
