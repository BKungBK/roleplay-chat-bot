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

// Model Cascade Definition
const DEFAULT_MODEL = 'gemini-2.0-flash';
const ESCALATED_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'gemini-embedding-2';

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

[กฎการตอบกลับสำคัญ - Hidden Inner Thought]
ก่อนตอบคำถาม ให้คิดไตร่ตรองในใจเสมอโดยใส่ไว้ในแท็ก <inner_thought>...</inner_thought> เพื่อกำหนดอารมณ์ มุมมอง และเจตนาของตัวละคร จากนั้นค่อยตามด้วยคำตอบจริงที่จะแสดงให้ผู้ใช้เห็น

ตัวอย่างรูปแบบผลลัพธ์:
<inner_thought>ฉันรู้สึกดีใจที่เขาถามถึงเรื่องนี้ แต่จะลองหยอกล้อกลับนุ่มๆ</inner_thought>
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
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('quota')) {
      const fallbackModel = targetModel === 'gemini-2.0-flash' ? 'gemini-2.5-flash' : 'gemini-2.0-flash';
      console.warn(`[GEMINI FALLBACK] ${targetModel} hit rate limit, retrying with ${fallbackModel}...`);
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

  // Create / Compile New Bot Persona (Auth Required)
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
          avatar_url: body.avatar_url,
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

  // Create New Chat Session (Auth Required - Issue #1 Fix)
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
          title: title || 'บทสนทนาใหม่'
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

  // Fetch Chat Message History (Auth Required)
  .get(
    '/api/chats/:chatId/messages',
    async ({ params, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const { chatId } = params;

      const { data: messages, error } = await supabase
        .from('messages')
        .select('id, sender_type, content, created_at')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) throw new Error(error.message);
      return { messages };
    }
  )

  // Roleplay Chat Turn Completion with Vector RAG & Rolling Summary (Issue #2 Fix)
  .post(
    '/api/chat',
    async ({ body, headers, set }) => {
      const activeUser = await getAuthenticatedUser(headers, set);
      if (!activeUser) return 'Unauthorized';

      const { chatId, message, botId } = body;

      // 1. Fetch Bot Persona & System Prompt
      const { data: bot, error: botErr } = await supabase.from('bots').select('*').eq('id', botId).single();
      if (botErr || !bot) throw new Error('Bot not found');

      // 2. Generate Embedding for User Message (RAG Memory Retrieval)
      let userEmbedding: number[] | null = null;
      try {
        const embedRes = await ai.models.embedContent({
          model: EMBEDDING_MODEL,
          contents: message
        });
        userEmbedding = (embedRes.embedding?.values as number[]) || null;
      } catch (err) {
        console.warn('Embedding generation skipped/failed:', err);
      }

      // 3. Retrieve Vector Memories (RAG)
      let ragContext = '';
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

      // 4. Fetch Rolling Summary
      const { data: chatData } = await supabase
        .from('chats')
        .select('summary')
        .eq('id', chatId)
        .single();

      let systemPrompt = bot.system_prompt + ragContext;
      if (chatData?.summary) {
        systemPrompt += `\n\n[สรุปเนื้อหาบทสนทนาก่อนหน้า]\n${chatData.summary}`;
      }

      // 5. Fetch Recent Chat History (Sliding Window - Last 15 messages)
      const { data: rawHistory } = await supabase
        .from('messages')
        .select('sender_type, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(15);

      const history = (rawHistory || []).reverse();

      // 6. Save User Message
      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_type: 'user',
        content: message
      });

      // 7. Determine Model via Cascade Strategy
      const targetModel = selectModel(message, history.length);

      // 8. Construct Prompt History for Gemini
      const formattedHistory = history.map((m) => ({
        role: m.sender_type === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const contents = [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message }] }
      ];

      // 9. Call Gemini API with Fallback & System Instruction
      const response = await generateContentWithFallback(targetModel, contents, systemPrompt, bot.temperature || 0.7);
      const fullOutput = response.text || '';

      // 10. Extract Hidden inner_thought & Visible Reply
      let innerThought = '';
      let visibleReply = fullOutput;

      const thoughtMatch = fullOutput.match(/<inner_thought>([\s\S]*?)<\/inner_thought>/);
      if (thoughtMatch) {
        innerThought = thoughtMatch[1].trim();
        visibleReply = fullOutput.replace(/<inner_thought>[\s\S]*?<\/inner_thought>/, '').trim();
      }

      // 11. Save Bot Message
      const { data: savedMsg, error: msgErr } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          sender_type: 'bot',
          content: visibleReply,
          inner_thought: innerThought,
          model_used: targetModel
        })
        .select()
        .single();

      if (msgErr) throw new Error(msgErr.message);

      // 12. Asynchronous Long-term Fact Memory Save
      (async () => {
        try {
          const factPrompt = `วิเคราะห์ข้อความต่อไปนี้ของผู้ใช้ว่ามีข้อเท็จจริงระยะยาวที่สำคัญเกี่ยวกับผู้ใช้หรือไม่ (เช่น ชื่อ, งานอดิเรก, สิ่งที่ชอบ/ไม่ชอบ, ประวัติส่วนตัว, เหตุการณ์สำคัญ):\nข้อความผู้ใช้: "${message}"\n\nหากมีข้อเท็จจริงสำคัญ ให้สรุปเป็นประโยคสั้นๆ 1 ประโยค หากไม่มี ให้ตอบเพียง "NONE"`;
          
          const factRes = await generateContentWithFallback(DEFAULT_MODEL, [{ role: 'user', parts: [{ text: factPrompt }] }], '', 0.1);
          const extractedFact = factRes.text?.trim() || '';

          if (extractedFact && !extractedFact.toUpperCase().includes('NONE') && extractedFact.length > 5) {
            const factEmbedRes = await ai.models.embedContent({
              model: EMBEDDING_MODEL,
              contents: extractedFact
            });

            if (factEmbedRes.embedding?.values) {
              await supabase.from('memories').insert({
                bot_id: botId,
                user_id: activeUser.id,
                content: extractedFact,
                embedding: factEmbedRes.embedding.values,
                fact_category: 'user_fact'
              });
            }
          }
        } catch (err) {
          console.warn('Async fact memory extraction error:', err);
        }
      })();

      // 13. Asynchronous Rolling Summary Trigger (>15 turns)
      (async () => {
        try {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chatId);

          if (count && count >= 16 && count % 5 === 0) {
            const { data: oldTurns } = await supabase
              .from('messages')
              .select('id, sender_type, content')
              .eq('chat_id', chatId)
              .order('created_at', { ascending: true })
              .limit(count - 10);

            if (oldTurns && oldTurns.length > 5) {
              const turnsText = oldTurns.map(t => `${t.sender_type}: ${t.content}`).join('\n');
              const summaryPrompt = `สรุปย่อประเด็นสำคัญของบทสนทนานี้อย่างกระชับ:\n${turnsText}`;
              
              const sumRes = await generateContentWithFallback(DEFAULT_MODEL, [{ role: 'user', parts: [{ text: summaryPrompt }] }], '', 0.3);
              const summaryText = sumRes.text?.trim();

              if (summaryText) {
                await supabase.from('chats').update({ summary: summaryText }).eq('id', chatId);
                await supabase.from('memory_summaries').insert({
                  chat_id: chatId,
                  summary_text: summaryText,
                  turn_count: oldTurns.length,
                  start_message_id: oldTurns[0].id,
                  end_message_id: oldTurns[oldTurns.length - 1].id
                });
              }
            }
          }
        } catch (err) {
          console.warn('Async rolling summary error:', err);
        }
      })();

      return {
        success: true,
        message: {
          id: savedMsg.id,
          sender_type: 'bot',
          content: visibleReply,
          created_at: savedMsg.created_at
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
