CREATE TABLE public.voice_settings (
  user_id uuid PRIMARY KEY,
  voice text NOT NULL DEFAULT 'hi-IN-SwaraNeural',
  rate integer NOT NULL DEFAULT 3,
  pitch integer NOT NULL DEFAULT 4,
  use_phone boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_settings TO authenticated;
GRANT ALL ON public.voice_settings TO service_role;
ALTER TABLE public.voice_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own voice settings select" ON public.voice_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own voice settings insert" ON public.voice_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own voice settings update" ON public.voice_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);