-- webrtc-core: generic, role-agnostic participant log.
-- Apply once to the Supabase project a consumer points the core at.
--
-- Keyed by call_id (= the core's roomId; a uuid). No FK — call_id is an opaque
-- room/call identifier, matching call_telemetry / webrtc_diagnostics (whose
-- call_id FKs were intentionally dropped). Scales to ANY role string
-- (mentor | student | coach | advisor | …) with zero schema churn.

CREATE TABLE IF NOT EXISTS public.call_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  call_id UUID NOT NULL,
  participant_id TEXT NOT NULL,
  role TEXT NOT NULL,
  joined_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (call_id, participant_id)
);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON public.call_participants(call_id);

ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

-- Mirror call_telemetry's permissive client-access policies.
DROP POLICY IF EXISTS "Anyone can read call_participants" ON public.call_participants;
CREATE POLICY "Anyone can read call_participants" ON public.call_participants FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert call_participants" ON public.call_participants;
CREATE POLICY "Anyone can insert call_participants" ON public.call_participants FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update call_participants" ON public.call_participants;
CREATE POLICY "Anyone can update call_participants" ON public.call_participants FOR UPDATE USING (true);
