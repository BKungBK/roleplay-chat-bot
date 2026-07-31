-- Enable pgvector extension for long-term memory search
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Users Table (Extension of Auth users or custom user profile)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Bots Table (Persona system)
CREATE TABLE IF NOT EXISTS public.bots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar_url TEXT,
    personality TEXT NOT NULL,         -- Freeform character personality & backstory
    speech_style TEXT,                 -- Tone, vocabulary, speech quirks
    likes_dislikes TEXT,               -- Favorites, dislikes, triggers
    boundaries TEXT,                   -- Character limits & safe guardrails
    system_prompt TEXT NOT NULL,       -- Compiled server-side system prompt
    temperature FLOAT DEFAULT 0.7 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. Chats Table
CREATE TABLE IF NOT EXISTS public.chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
    title TEXT DEFAULT 'บทสนทนาใหม่' NOT NULL,
    relationship_score INT DEFAULT 50 NOT NULL,
    current_mood TEXT DEFAULT 'พร้อมฟังเสมอ' NOT NULL,
    summary TEXT,                      -- Current rolling summary of recent turns
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
    sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'bot')),
    content TEXT NOT NULL,
    inner_thought TEXT,                -- Hidden reasoning emitted before visible reply
    model_used TEXT,                   -- Gemini model used (e.g. gemini-3.5-flash-lite)
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. Memories Table (Vector memory using pgvector)
CREATE TABLE IF NOT EXISTS public.memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_id UUID REFERENCES public.bots(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    content TEXT NOT NULL,              -- Standout fact or memory detail
    embedding vector(768),             -- Embedding vector for semantic RAG search
    fact_category TEXT DEFAULT 'general',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fast vector similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS memories_embedding_idx ON public.memories 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 6. Memory Summaries Table
CREATE TABLE IF NOT EXISTS public.memory_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
    summary_text TEXT NOT NULL,
    start_message_id UUID REFERENCES public.messages(id),
    end_message_id UUID REFERENCES public.messages(id),
    turn_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Match Memories Function (Cosine Similarity RAG Search)
CREATE OR REPLACE FUNCTION match_memories(
    query_embedding vector(768),
    match_threshold float,
    match_count int,
    p_bot_id uuid,
    p_user_id uuid
)
RETURNS TABLE (
    id uuid,
    content text,
    fact_category text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        memories.id,
        memories.content,
        memories.fact_category,
        1 - (memories.embedding <=> query_embedding) AS similarity
    FROM memories
    WHERE memories.bot_id = p_bot_id
      AND memories.user_id = p_user_id
      AND 1 - (memories.embedding <=> query_embedding) > match_threshold
    ORDER BY memories.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_summaries ENABLE ROW LEVEL SECURITY;

-- RLS Policies (User can access their own data, public bots read-only if public)
CREATE POLICY "Users access own profile" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Users access own bots" ON public.bots FOR ALL USING (auth.uid() = user_id OR user_id IS NULL);
CREATE POLICY "Users access own chats" ON public.chats FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access messages in own chats" ON public.messages FOR ALL USING (
    EXISTS (SELECT 1 FROM public.chats WHERE chats.id = messages.chat_id AND chats.user_id = auth.uid())
);
CREATE POLICY "Users access own bot memories" ON public.memories FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users access own chat summaries" ON public.memory_summaries FOR ALL USING (
    EXISTS (SELECT 1 FROM public.chats WHERE chats.id = memory_summaries.chat_id AND chats.user_id = auth.uid())
);
