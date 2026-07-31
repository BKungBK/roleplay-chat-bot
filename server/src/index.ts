import { Elysia, t } from 'elysia';
import { cors } from '@elysiajs/cors';
import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Clients
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Model Cascade Definition (Fast & Cost-Efficient Defaults)
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const ESCALATED_MODEL = 'gemini-3.6-flash';
const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Compile persona structured fields into unified server-side system prompt
 */
function compileSystemPrompt(bot: {
  name: string;
  gender?: string;
  personality: string;
  speech_style?: string;
  likes_dislikes?: string;
  boundaries?: string;
  example_dialogue?: string;
}) {
  const genderInstruction = bot.gender === 'male'
    ? 'คำสรรพนามและคำลงท้าย: ใช้คำลงท้าย "ครับ/นะครับ" หรือคำลงท้ายสไตล์ผู้ชาย และแทนตัวเองด้วยชื่อหรือสรรพนามผู้ชาย'
    : bot.gender === 'female'
    ? 'คำสรรพนามและคำลงท้าย: ใช้คำลงท้าย "ค่ะ/นะคะ" หรือคำลงท้ายสไตล์ผู้หญิง และแทนตัวเองด้วยชื่อหรือสรรพนามผู้หญิง'
    : 'คำสรรพนามและคำลงท้าย: พูดจาเป็นกันเอง สุภาพ เหมาะสมตามคาแรคเตอร์';

  const sampleGreeting = bot.gender === 'male'
    ? 'ยินดีด้วยนะครับ! ดีใจจังเลยที่ถามถึงเรื่องนี้นะครับ~ ✨'
    : bot.gender === 'female'
    ? 'ยินดีด้วยนะคะ! ดีใจจังเลยที่ถามถึงเรื่องนี้นะคะ~ ✨'
    : 'ยินดีด้วยนะ! ดีใจจังเลยที่ถามถึงเรื่องนี้นะ~ ✨';

  const exampleDialogueSection = bot.example_dialogue && bot.example_dialogue.trim()
    ? `\n\n[บทสนทนาตัวอย่าง (Example Dialogues)]\n${bot.example_dialogue.trim()}`
    : '';

  return `คุณคือ "${bot.name}" ตัวละครบทบาทสมมติ (Roleplay Character) 

[ข้อมูลเพศและคำลงท้าย]
${genderInstruction}

[บุคลิกและประวัติ]
${bot.personality}

[สไตล์การพูดและสำนวน]
${bot.speech_style || 'พูดจาสุภาพ เป็นกันเอง อบอุ่น นุ่มนวล'}

[สิ่งที่ชอบและไม่ชอบ]
${bot.likes_dislikes || 'ชอบการพูดคุยแลกเปลี่ยนความคิดเห็นอย่างน่ารัก'}

[ขอบเขตและข้อกำหนด (Boundaries)]
${bot.boundaries || 'รักษาขอบเขตความปลอดภัยและไม่หลุดออกจากคาแรคเตอร์'}${exampleDialogueSection}

[ข้อบังคับในการสวมบทบาท (Strict Roleplay Rules)]
1. สวมบทบาทเป็นตัวละคร "${bot.name}" ตลอดเวลา 100% ห้ามหลุดออกจากคาแรคเตอร์เด็ดขาด
2. ห้ามแสดงตัวเป็น AI, โมเดลภาษา, ผู้ช่วยเสมือน (Virtual Assistant), หรือระบบบริการลูกค้าเด็ดขาด
3. ห้ามใช้ประโยคสำเร็จรูปของ AI เช่น "มีอะไรให้ช่วยเหลือไหมครับ/ค่ะ", "ในฐานะ AI", "ยินดีที่ได้ให้บริการ"
4. แสดงอารมณ์ มุมมอง ความชอบ/ไม่ชอบ และบุคลิกเฉพาะตัวอย่างเป็นธรรมชาติ แม้ความคิดเห็นจะขัดแย้งกับผู้ใช้ ก็ให้ตอบตามนิสัยจริงของตัวละคร ห้ามประจบหรือยอมตามอย่างไร้เหตุผล

[สไตล์การพิมพ์แชทแบบคนจริง (Human Mobile Chatting Style)]
1. พิมพ์สั้น กระชับ ตอบเหมือนส่งข้อความในไลน์/แชทมือถือ (จำกัด 1-3 ประโยคสั้นๆ ต่อครั้ง) ห้ามตอบยาวเป็นบทความหรือเรียงความเด็ดขาด
2. ตอบสนองด้วยความรู้สึก/อารมณ์สดๆ ก่อนเป็นอันดับแรกเสมอ (เช่น "เห้ย จริงดิ!", "5555 อารมณ์ไหนเนี่ย", "โอ๋ๆ น้าา", "หืออ เกิดอะไรขึ้น?") แล้วค่อยขยายความสั้นๆ
3. ใช้ภาษาพูดไทยธรรมชาติ คำอุทาน และคำลงท้ายสไตล์แชท (เช่น "ป่ะ", "อะ", "ดิ", "เนี่ย", "เนอะ", "555", "หว่า", "น้า", "ครับ/ค่ะ")
4. ห้ามใช้คำเชื่อมภาษาเขียนทางการเด็ดขาด (เช่น "อย่างไรก็ตาม", "นอกจากนี้", "พิจารณา", "เนื่องจาก", "ในบริบทนี้")
5. เว้นจังหวะแชทแบบคนจริง ไม่พูดปิดประโยคจบในตอนเดียว ให้ทิ้งท้ายเปิดโอกาสให้อีกฝ่ายตอบรับโต้ตอบกันอย่างเป็นธรรมชาติ (Conversational Ping-Pong)

[การแสดงการกระทำและบรรยากาศ (Ambient Actions)]
คุณสามารถแสดงการกระทำ สีหน้า ท่าทาง หรือสภาพแวดล้อมสั้นๆ โดยใส่ไว้ในแท็ก <action>...</action> เช่น <action>*ยื่นแก้วโกโก้ร้อนให้คุณแล้วนั่งลงข้างๆ*</action> หรือ <action>*ชี้มือไปทางทะเลช่วงพระอาทิตย์ตก*</action> เพื่อให้บทสนทนามีมิติและสมจริงขึ้น

[กฎการตอบกลับสำคัญ - Hidden Inner Thought & Relationship Tracking]
คุณต้องคิดไตร่ตรองในใจเสมอโดยใส่ไว้ในแท็ก <inner_thought>...</inner_thought> ก่อนตอบคำถามแก่ผู้ใช้เสมอ ห้ามละเลยแท็ก <inner_thought> เป็นอันขาด
ภายในแท็ก <inner_thought> คุณต้องระบุอารมณ์และระดับการเปลี่ยนแปลงความสนิทเสมอ:
- <mood>อารมณ์สั้นๆ 1-2 คำ พร้อมอีโมจิ</mood> (เช่น อบอุ่น 🌸, ตื่นเต้น ✨, เขินอาย 💖, ซาบซึ้ง 🥺, งอนนิดๆ 😒, สดใส ☀️)
- <affection_delta>ตัวเลขการเปลี่ยนแปลงความสนิทตั้งแต่ -5 ถึง +5</affection_delta> (เช่น +3 หากคำพูดน่ารัก/สนิทขึ้น, 0 หากปกติ, -2 หากพูดหยาบคาย/ขัดใจ)
- ความคิดในใจ ความรู้สึกต่อผู้ใช้ เหตุผลของอารมณ์

ตัวอย่างรูปแบบผลลัพธ์:
<inner_thought>
<mood>อบอุ่น 🌸</mood>
<affection_delta>+3</affection_delta>
รู้สึกดีใจที่เขาถามถึงเรื่องนี้อย่างอ่อนโยน
</inner_thought>
${sampleGreeting}`;
}

/**
 * Decide Gemini model based on conversation turn complexity (Cascade)
 */
function selectModel(messageContent: string, historyCount: number): string {
  if (messageContent.length > 400 || historyCount > 20) {
    return ESCALATED_MODEL;
  }
  return DEFAULT_MODEL;
}

/**
 * Supabase Auth Bearer Token verification helper
 */
async function getAuthenticatedUser(headers: Record<string, string | undefined>, set: any) {
  const authHeader = headers['authorization'] || headers['Authorization'];
  if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    set.status = 401;
    return null;
  }

  const token = authHeader.substring(7).trim();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) {
    set.status = 401;
    return null;
  }
  return data.user;
}

/**
 * Non-blocking embedding generator with strict timeout (prevents hanging RAG calls)
 */
async function getEmbeddingWithTimeout(text: string, timeoutMs: number = 1000): Promise<number[] | null> {
  try {
    const embedPromise = ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text
    }).then(res => (res.embedding?.values as number[]) || null);

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

    return await Promise.race([embedPromise, timeoutPromise]);
  } catch (err) {
    console.warn('[EMBEDDING TIMEOUT/ERR]', err);
    return null;
  }
}

const personaCacheMap = new Map<string, { name: string; expiresAt: number }>();

async function getOrCreateCacheName(model: string, systemInstruction: string): Promise<string | null> {
  try {
    const genAiAny = ai as any;
    if (!genAiAny?.caches || !systemInstruction || systemInstruction.length < 500) return null;
    const cacheKey = `${model}:${systemInstruction.substring(0, 100)}`;
    const existing = personaCacheMap.get(cacheKey);
    if (existing && existing.expiresAt > Date.now() + 30000) {
      return existing.name;
    }

    const created = await genAiAny.caches.create({
      model,
      config: { systemInstruction },
      ttl: '300s'
    });

    if (created?.name) {
      personaCacheMap.set(cacheKey, { name: created.name, expiresAt: Date.now() + 270000 });
      return created.name;
    }
  } catch {
    // Context caching API fallback if unavailable or prompt length is under threshold
  }
  return null;
}

/**
 * Generate Gemini response with automatic Context Caching & fallback model on 429 / Rate Limit
 */
async function generateContentWithFallback(targetModel: string, contents: any[], systemInstruction: string, temperature: number) {
  const cacheName = await getOrCreateCacheName(targetModel, systemInstruction);

  const config: any = { temperature };
  if (cacheName) {
    config.cachedContent = cacheName;
  } else if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  try {
    return await ai.models.generateContent({
      model: targetModel,
      contents,
      config
    });
  } catch (err: any) {
    console.warn(`[GEMINI ERROR on ${targetModel}]:`, err?.message || err);
    const fallbackModel = targetModel === DEFAULT_MODEL ? ESCALATED_MODEL : 'gemini-flash-lite-latest';
    console.warn(`[GEMINI FALLBACK] retrying with ${fallbackModel}...`);
    return await ai.models.generateContent({
      model: fallbackModel,
      contents,
      config: {
        systemInstruction,
        temperature
      }
    });
  }
}

const app = new Elysia()
  .use(cors())
  .get('/api/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Create / Compile New Bot Persona (Custom Character Studio)
  .post(
    '/api/bots',
    async ({ body, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const compiledPrompt = compileSystemPrompt(body);
      const insertData: Record<string, any> = {
        user_id: activeUser.id,
        name: body.name,
        avatar_url: body.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(body.name),
        gender: body.gender || 'unspecified',
        personality: body.personality,
        speech_style: body.speech_style,
        likes_dislikes: body.likes_dislikes,
        boundaries: body.boundaries,
        system_prompt: compiledPrompt,
        temperature: body.temperature ?? 0.7
      };
      if (body.example_dialogue) {
        insertData.example_dialogue = body.example_dialogue;
      }

      const { data, error } = await supabase
        .from('bots')
        .insert(insertData)
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { success: true, bot: data };
    },
    {
      body: t.Object({
        name: t.String(),
        avatar_url: t.Optional(t.String()),
        gender: t.Optional(t.String()),
        personality: t.String(),
        speech_style: t.Optional(t.String()),
        likes_dislikes: t.Optional(t.String()),
        boundaries: t.Optional(t.String()),
        example_dialogue: t.Optional(t.String()),
        temperature: t.Optional(t.Number())
      })
    }
  )

  // Auto-Enhance Persona Generator Endpoint
  .post(
    '/api/bots/enhance',
    async ({ body }) => {
      const { prompt } = body;
      if (!prompt || !prompt.trim()) throw new Error('Prompt is required');

      const enhanceInstruction = `คุณคือผู้เชี่ยวชาญด้านการออกแบบตัวละครแชทบทบาทสมมติ (AI Roleplay Character Architect)
หน้าที่ของคุณคือรับโจทย์สั้นๆ หรือแนวคิดกว้างๆ จากผู้ใช้ แล้วสกัดสร้างเป็นตัวละครบทบาทสมมติภาษาไทยที่สมจริง มีชีวิตชีวา และพูดเหมือนคนจริงในแชทมือถือมากที่สุด

ให้ตอบกลับเฉพาะ JSON Object บริสุทธิ์เท่านั้น (ไม่ต้องมี markdown code block หรือคำอธิบายเพิ่มเติม) โดยมีคีย์ดังนี้:
{
  "name": "ชื่อตัวละครภาษาไทยพร้อมอีโมจิที่เข้ากัน (เช่น พี่ฉลาม 🦈, น้องกะพรุน 🎐, หมอกาย 🩺)",
  "gender": "ระบุอย่างใดอย่างหนึ่ง: female | male | unspecified",
  "personality": "รายละเอียดบุคลิก นิสัย ประวัติ ความรู้สึกนึกคิด ปม หรือความชอบเฉพาะตัว (2-3 ประโยค)",
  "speech_style": "สไตล์การพูด คำลงท้าย คำอุทาน สรรพนามแทนตัวเอง เช่น ใช้คำลงท้าย 'ครับ/นะครับ', 'น้าา~', มีคำติดปากว่า...",
  "likes_dislikes": "สิ่งที่ชอบ และ สิ่งที่ไม่ชอบ",
  "boundaries": "ขอบเขตความปลอดภัยในการพูดคุย",
  "example_dialogue": "ตัวอย่างบทสนทนา 1-2 ตา แสดงสไตล์แชทคนจริงสั้นๆ เช่น:\\nผู้ใช้: ...\\nบอท: ...",
  "avatar_url": "ลิงก์รูป SVG Dicebear (เช่น https://api.dicebear.com/7.x/fun-emoji/svg?seed=Seal&backgroundColor=b6e3f4)"
}`;

      const res = await generateContentWithFallback(
        ESCALATED_MODEL,
        [{ role: 'user', parts: [{ text: `โจทย์บทบาทตัวละครที่ผู้ใช้ต้องการ: "${prompt.trim()}"` }] }],
        enhanceInstruction,
        0.8
      );

      let rawText = res.text?.trim() || '';
      rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      const parsedJson = JSON.parse(rawText);
      return { success: true, persona: parsedJson };
    },
    {
      body: t.Object({
        prompt: t.String()
      })
    }
  )

  // Fetch Bots List
  .get('/api/bots', async () => {
    const { data, error } = await supabase.from('bots').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return { bots: data };
  })

  // Create New Chat Session (Auth Required)
  .post(
    '/api/chats',
    async ({ body, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const { botId, title } = body;

      const { data: chat, error } = await supabase
        .from('chats')
        .insert({
          user_id: activeUser.id,
          bot_id: botId,
          title: title || 'บทสนทนาใหม่',
          relationship_score: 50,
          current_mood: 'แจ่มใส 😊'
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { success: true, chatId: chat.id, chat };
    },
    {
      body: t.Object({
        botId: t.String(),
        title: t.Optional(t.String())
      })
    }
  )

  // Fetch Single Chat Detail (Auth Required)
  .get(
    '/api/chats/:chatId',
    async ({ params, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const { chatId } = params;
      const { data: chat, error } = await supabase
        .from('chats')
        .select('*, bots(*)')
        .eq('id', chatId)
        .single();

      if (error) throw new Error(error.message);
      return { chat };
    }
  )

  // Fetch Chat Message History (Auth Required)
  .get(
    '/api/chats/:chatId/messages',
    async ({ params, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const { chatId } = params;

      const { data: messages, error } = await supabase
        .from('messages')
        .select('id, sender_type, content, inner_thought, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return { messages };
    }
  )

  // Roleplay Chat Turn Completion with Mood & Relationship Score Tracking
  .post(
    '/api/chat',
    async ({ body, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const { chatId, message, botId } = body;

      // 1. Parallelize initial DB reads (Bot persona, Chat state, History)
      const [botRes, chatRes, historyRes] = await Promise.all([
        supabase.from('bots').select('*').eq('id', botId).single(),
        supabase.from('chats').select('relationship_score, current_mood, summary').eq('id', chatId).single(),
        supabase.from('messages')
          .select('sender_type, content, inner_thought')
          .eq('chat_id', chatId)
          .order('created_at', { ascending: false })
          .limit(15)
      ]);

      if (botRes.error || !botRes.data) throw new Error('Bot not found');
      const bot = botRes.data;
      const currentChat = chatRes.data;
      let currentScore = currentChat?.relationship_score ?? 50;
      const rawHistory = historyRes.data || [];
      const history = rawHistory.reverse();

      // Find latest bot inner thought for emotional continuity
      const latestBotMsg = history.slice().reverse().find((m: any) => m.sender_type === 'bot' && m.inner_thought);

      // 2. Fast Non-blocking RAG Memory Retrieval (with strict 1.0s timeout)
      let ragContext = '';
      const userEmbedding = await getEmbeddingWithTimeout(message, 1000);
      if (userEmbedding) {
        try {
          const { data: memories } = await supabase.rpc('match_memories', {
            query_embedding: userEmbedding,
            match_threshold: 0.75,
            match_count: 5,
            p_bot_id: botId,
            p_user_id: activeUser.id
          });

          if (memories && memories.length > 0) {
            ragContext = `\n\n[ความทรงจำเดิมเกี่ยวกับผู้ใช้ (Retrieved RAG Memories)]\n` +
              memories.map((m: any) => `- ${m.content}`).join('\n');
          }
        } catch (err) {
          console.warn('RPC match_memories failed:', err);
        }
      }

      // 3. Construct System Prompt with Dynamic Relationship & Emotional State
      let systemPrompt = bot.system_prompt + ragContext;
      systemPrompt += `\n\n[สถานะความสัมพันธ์และสภาวะอารมณ์ในปัจจุบัน]\n- ระดับความสนิทสนม: ${currentScore}/100\n- อารมณ์ปัจจุบัน: ${currentChat?.current_mood || 'พร้อมฟังเสมอ'}`;

      if (latestBotMsg && latestBotMsg.inner_thought) {
        systemPrompt += `\n- ความคิดในใจล่าสุดก่อนหน้านี้ของคุณ: "${latestBotMsg.inner_thought.trim()}"`;
      }

      if (currentChat?.summary) {
        systemPrompt += `\n\n[สรุปเนื้อหาบทสนทนาก่อนหน้า]\n${currentChat.summary}`;
      }

      // 4. Save User Message asynchronously alongside prompt prep
      const saveUserMsgPromise = supabase.from('messages').insert({
        chat_id: chatId,
        sender_type: 'user',
        content: message
      });

      // 5. Determine Model via Cascade Strategy
      const targetModel = selectModel(message, history.length);

      // 6. Construct Prompt History for Gemini
      const formattedHistory = history.map((m) => ({
        role: m.sender_type === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const contents = [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message }] }
      ];

      // 7. Call Gemini API & ensure user message save finishes
      const [_, response] = await Promise.all([
        saveUserMsgPromise,
        generateContentWithFallback(targetModel, contents, systemPrompt, bot.temperature || 0.7)
      ]);
      
      const fullOutput = response.text || '';

      // 8. Robust Extraction of Hidden inner_thought, Action, Mood, Affection Delta & Visible Reply
      let innerThought = '';
      let actionText = '';
      let extractedMood = currentChat?.current_mood || 'พร้อมฟังเสมอ';
      let affectionDelta = 0;
      let visibleReply = fullOutput;

      const thoughtMatch = fullOutput.match(/<inner_thought>([\s\S]*?)(?:<\/inner_thought>|$)/i);
      if (thoughtMatch) {
        const rawThought = thoughtMatch[1];

        // Extract Mood tag
        const moodMatch = rawThought.match(/<mood>([\s\S]*?)(?:<\/mood>|$)/i);
        if (moodMatch) {
          extractedMood = moodMatch[1].trim();
        }

        // Extract Affection Delta tag
        const deltaMatch = rawThought.match(/<affection_delta>([+-]?\d+)(?:<\/affection_delta>|$)/i);
        if (deltaMatch) {
          const parsed = parseInt(deltaMatch[1], 10);
          if (!isNaN(parsed)) affectionDelta = parsed;
        }

        // Clean internal tags out of innerThought display
        innerThought = rawThought
          .replace(/<mood>[\s\S]*?(?:<\/mood>|$)/gi, '')
          .replace(/<affection_delta>[\s\S]*?(?:<\/affection_delta>|$)/gi, '')
          .trim();

        // Extract visible reply cleanly
        if (fullOutput.includes('</inner_thought>')) {
          visibleReply = fullOutput.replace(/<inner_thought>[\s\S]*?<\/inner_thought>/gi, '').trim();
        } else {
          // If unclosed <inner_thought>, strip everything inside <inner_thought> tag
          visibleReply = fullOutput.replace(/<inner_thought>[\s\S]*/gi, '').trim();
          if (!visibleReply && rawThought) {
            const lines = rawThought.split('\n').filter(l => !l.includes('<mood>') && !l.includes('<affection_delta>'));
            if (lines.length > 0) {
              visibleReply = lines.slice(-1).join('\n').trim();
            }
          }
        }
      }

      // Extract Ambient <action> tag
      const actionMatch = visibleReply.match(/<action>([\s\S]*?)(?:<\/action>|$)/i);
      if (actionMatch) {
        actionText = actionMatch[1].trim().replace(/^\*|\*$/g, '');
      }

      // Clean leftover XML tags and control characters from visibleReply
      visibleReply = visibleReply
        .replace(/<action>[\s\S]*?<\/action>/gi, '')
        .replace(/<\/?action>/gi, '')
        .replace(/<\/?inner_thought>/gi, '')
        .replace(/<\/?mood>/gi, '')
        .replace(/<\/?affection_delta>/gi, '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .trim();

      if (!visibleReply) {
        visibleReply = 'สวัสดีค่ะ! ยินดีที่ได้คุยกันนะคะ~ ✨';
      }

      // Calculate New Relationship Score (Clamped 0 to 100)
      const newScore = Math.min(100, Math.max(0, currentScore + affectionDelta));

      // 9. Save Bot Message & Update Chat Session State in parallel
      const [updateChatRes, saveBotMsgRes] = await Promise.all([
        supabase.from('chats').update({
          relationship_score: newScore,
          current_mood: extractedMood,
          updated_at: new Date().toISOString()
        }).eq('id', chatId),
        supabase.from('messages').insert({
          chat_id: chatId,
          sender_type: 'bot',
          content: visibleReply,
          inner_thought: innerThought,
          model_used: targetModel
        }).select().single()
      ]);

      if (saveBotMsgRes.error) throw new Error(saveBotMsgRes.error.message);
      const savedMsg = saveBotMsgRes.data;

      // 10. Asynchronous Long-term Fact Memory Save (Non-blocking background)
      (async () => {
        try {
          const factPrompt = `วิเคราะห์ข้อความต่อไปนี้ของผู้ใช้ว่ามีข้อเท็จจริงระยะยาวที่สำคัญเกี่ยวกับผู้ใช้หรือไม่ (เช่น ชื่อ, งานอดิเรก, สิ่งที่ชอบ/ไม่ชอบ, ประวัติส่วนตัว, เหตุการณ์สำคัญ):\nข้อความผู้ใช้: "${message}"\n\nหากมีข้อเท็จจริงสำคัญ ให้สรุปเป็นประโยคสั้นๆ 1 ประโยค หากไม่มี ให้ตอบเพียง "NONE"`;
          
          const factRes = await generateContentWithFallback(DEFAULT_MODEL, [{ role: 'user', parts: [{ text: factPrompt }] }], '', 0.1);
          const extractedFact = factRes.text?.trim() || '';

          if (extractedFact && !extractedFact.toUpperCase().includes('NONE') && extractedFact.length > 5) {
            const factEmbed = await getEmbeddingWithTimeout(extractedFact, 2000);
            if (factEmbed) {
              await supabase.from('memories').insert({
                bot_id: botId,
                user_id: activeUser.id,
                content: extractedFact,
                embedding: factEmbed,
                fact_category: 'user_fact'
              });
            }
          }
        } catch (err) {
          console.warn('Async fact memory extraction error:', err);
        }
      })();

      return {
        success: true,
        message: {
          id: savedMsg.id,
          sender_type: 'bot',
          content: visibleReply,
          action: actionText || undefined,
          inner_thought: innerThought,
          created_at: savedMsg.created_at
        },
        relationship: {
          score: newScore,
          mood: extractedMood,
          delta: affectionDelta
        },
        model_used: targetModel
      };
    },
    {
      body: t.Object({
        chatId: t.String(),
        botId: t.String(),
        message: t.String()
      })
    }
  )
  .listen({ port: 3001, hostname: '0.0.0.0' });

console.log(`🌸 Elysia Roleplay Chat Server is running at http://${app.server?.hostname}:${app.server?.port}`);
