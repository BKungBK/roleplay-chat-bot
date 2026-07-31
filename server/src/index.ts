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
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const ESCALATED_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'text-embedding-004';

/**
 * Compile persona structured fields into unified server-side system prompt
 */
function compileSystemPrompt(bot: {
  name: string;
  personality: string;
  speech_style?: string;
  likes_dislikes?: string;
  boundaries?: string;
}) {
  return `คุณคือ "${bot.name}" ตัวละครบทบาทสมมติ (Roleplay Bot) 

[บุคลิกและประวัติ]
${bot.personality}

[สไตล์การพูดและสำนวน]
${bot.speech_style || 'พูดจาสุภาพ เป็นกันเอง อบอุ่น นุ่มนวล'}

[สิ่งที่ชอบและไม่ชอบ]
${bot.likes_dislikes || 'ชอบการพูดคุยแลกเปลี่ยนความคิดเห็นอย่างน่ารัก'}

[ขอบเขตและข้อกำหนด (Boundaries)]
${bot.boundaries || 'รักษาขอบเขตความปลอดภัยและไม่หลุดออกจากคาแรคเตอร์'}

[กฎการตอบกลับสำคัญ - Hidden Inner Thought & Relationship Tracking]
ก่อนตอบคำถาม ให้คิดไตร่ตรองในใจเสมอโดยใส่ไว้ในแท็ก <inner_thought>...</inner_thought> 
ภายในแท็ก <inner_thought> คุณต้องระบุอารมณ์และระดับการเปลี่ยนแปลงความสนิทเสมอ:
- <mood>อารมณ์สั้นๆ 1-2 คำ พร้อมอีโมจิ</mood> (เช่น อบอุ่น 🌸, ตื่นเต้น ✨, เขินอาย 💖, ซาบซึ้ง 🥺, งอนนิดๆ 😒, สดใส ☀️)
- <affection_delta>ตัวเลขการเปลี่ยนแปลงความสนิทตั้งแต่ -5 ถึง +5</affection_delta> (เช่น +3 หากคำพูดน่ารัก/สนิทขึ้น, 0 หากปกติ, -2 หากพูดหยาบคาย/ขัดใจ)
- ความคิดในใจ ความรู้สึกต่อผู้ใช้ เหตุผลของอารมณ์

ตัวอย่างรูปแบบผลลัพธ์:
<inner_thought>
<mood>อบอุ่น 🌸</mood>
<affection_delta>+3</affection_delta>
ฉันรู้สึกดีใจที่เขาถามถึงเรื่องนี้อย่างอ่อนโยน
</inner_thought>
สวัสดีค่ะ! ดีใจจังเลยที่ถามถึงเรื่องนี้นะคะ~`;
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

/**
 * Generate Gemini response with automatic fallback model on 429 / Rate Limit
 */
async function generateContentWithFallback(targetModel: string, contents: any[], systemInstruction: string, temperature: number) {
  try {
    return await ai.models.generateContent({
      model: targetModel,
      contents,
      config: {
        systemInstruction,
        temperature
      }
    });
  } catch (err: any) {
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota') || err?.status === 404) {
      const fallbackModel = targetModel.includes('lite') ? ESCALATED_MODEL : DEFAULT_MODEL;
      console.warn(`[GEMINI FALLBACK] ${targetModel} issue, retrying with ${fallbackModel}...`);
      return await ai.models.generateContent({
        model: fallbackModel,
        contents,
        config: {
          systemInstruction,
          temperature
        }
      });
    }
    throw err;
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
      const { data, error } = await supabase
        .from('bots')
        .insert({
          user_id: activeUser.id,
          name: body.name,
          avatar_url: body.avatar_url || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + encodeURIComponent(body.name),
          personality: body.personality,
          speech_style: body.speech_style,
          likes_dislikes: body.likes_dislikes,
          boundaries: body.boundaries,
          system_prompt: compiledPrompt,
          temperature: body.temperature ?? 0.7
        })
        .select()
        .single();

      if (error) throw new Error(error.message);
      return { success: true, bot: data };
    },
    {
      body: t.Object({
        name: t.String(),
        avatar_url: t.Optional(t.String()),
        personality: t.String(),
        speech_style: t.Optional(t.String()),
        likes_dislikes: t.Optional(t.String()),
        boundaries: t.Optional(t.String()),
        temperature: t.Optional(t.Number())
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
          .select('sender_type, content')
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

      // 3. Construct System Prompt with Dynamic Relationship State
      let systemPrompt = bot.system_prompt + ragContext;
      systemPrompt += `\n\n[สถานะความสัมพันธ์ปัจจุบัน]\n- ระดับความสนิทสนม: ${currentScore}/100\n- อารมณ์ล่าสุด: ${currentChat?.current_mood || 'พร้อมฟังเสมอ'}`;

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

      // 8. Robust Extraction of Hidden inner_thought, Mood, Affection Delta & Visible Reply
      let innerThought = '';
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

      // Clean leftover XML tags from visibleReply
      visibleReply = visibleReply
        .replace(/<\/?inner_thought>/gi, '')
        .replace(/<\/?mood>/gi, '')
        .replace(/<\/?affection_delta>/gi, '')
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
  .listen(3001);

console.log(`🌸 Elysia Roleplay Chat Server is running at http://${app.server?.hostname}:${app.server?.port}`);
