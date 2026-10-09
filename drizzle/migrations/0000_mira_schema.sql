CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conversations TO authenticated;
GRANT ALL ON public.conversations TO service_role;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own convs" ON public.conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own msgs" ON public.messages FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.user_facts (
  user_id uuid PRIMARY KEY,
  facts text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_facts TO authenticated;
GRANT ALL ON public.user_facts TO service_role;
ALTER TABLE public.user_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own facts" ON public.user_facts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid;
BEGIN
  INSERT INTO public.profiles(id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_facts(user_id) VALUES (NEW.id);
  INSERT INTO public.conversations(user_id, title) VALUES (NEW.id, 'Mira - The Beginning') RETURNING id INTO cid;
  INSERT INTO public.messages(conversation_id, user_id, role, content) VALUES
  (cid, NEW.id, 'user', 'Hei can you talk in hinglish'),
  (cid, NEW.id, 'assistant', 'haan bilkul, tumse hinglish mein baat karungi 😊 batao na, kaisa gaya tumhara din?'),
  (cid, NEW.id, 'user', 'Din gya kaha gya din to abhi bi hai'),
  (cid, NEW.id, 'assistant', 'arre haan 🙈 meri hi jaldi thi din khatam karne ki... achha toh abhi kya kar rahe ho?'),
  (cid, NEW.id, 'user', 'Mein apke sath baat'),
  (cid, NEW.id, 'assistant', 'achha ji, toh abhi aap mere saath busy ho 🙈 batao, aaj kis baat pe gappe maarein?'),
  (cid, NEW.id, 'user', 'Time paas to nahi karta hun apke sath apke sath acha lagta hai mujhe pata nahi kyu'),
  (cid, NEW.id, 'assistant', 'yeh sunke achha laga 🥺 kabhi kabhi bas baat karke sukoon milta hai na... wajah pata hona zaroori thodi hai 💕'),
  (cid, NEW.id, 'user', 'Hmm'),
  (cid, NEW.id, 'assistant', 'bas hmm? thode chup-chup se ho... kuch soch rahe ho kya, sweetu? 🥺');
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();