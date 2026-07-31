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
// Default: Cheapest Flash Lite tier (gemini-2.5-flash-lite / gemini-3.5-flash-lite)
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';
const ESCALATED_MODEL = 'gemini-2.5-flash';

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
  // If message length is over 400 chars or chat history is long (>20 turns), escalate to Flash tier
  if (messageContent.length > 400 || historyCount > 20) {
    return ESCALATED_MODEL;
  }
  return DEFAULT_MODEL;
}

const app = new Elysia()
  .use(cors())
  .get('/api/health', () => ({ status: 'ok', timestamp: new Date().toISOString() }))
  
  // Create / Compile New Bot Persona
  .post(
    '/api/bots',
    async ({ body }) => {
      const compiledPrompt = compileSystemPrompt(body);
      const { data, error } = await supabase
        .from('bots')
        .insert({
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

  // Roleplay Chat Turn Completion
  .post(
    '/api/chat',
    async ({ body }) => {
      const { chatId, message, botId } = body;

      // 1. Fetch Bot Persona & System Prompt
      const { data: bot, error: botErr } = await supabase.from('bots').select('*').eq('id', botId).single();
      if (botErr || !bot) throw new Error('Bot not found');

      // 2. Fetch Recent Chat History (Sliding Window - Last 15 messages)
      const { data: rawHistory } = await supabase
        .from('messages')
        .select('sender_type, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(15);

      const history = (rawHistory || []).reverse();

      // 3. Save User Message
      await supabase.from('messages').insert({
        chat_id: chatId,
        sender_type: 'user',
        content: message
      });

      // 4. Determine Model via Cascade Strategy
      const targetModel = selectModel(message, history.length);

      // 5. Construct Prompt History for Gemini
      const formattedHistory = history.map((m) => ({
        role: m.sender_type === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

      const contents = [
        ...formattedHistory,
        { role: 'user', parts: [{ text: message }] }
      ];

      // 6. Call Gemini API with System Instruction & Temperature
      const response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction: bot.system_prompt,
          temperature: bot.temperature || 0.7
        }
      });

      const fullOutput = response.text || '';

      // 7. Extract Hidden inner_thought & Visible Reply
      let innerThought = '';
      let visibleReply = fullOutput;

      const thoughtMatch = fullOutput.match(/<inner_thought>([\s\S]*?)<\/inner_thought>/);
      if (thoughtMatch) {
        innerThought = thoughtMatch[1].trim();
        visibleReply = fullOutput.replace(/<inner_thought>[\s\S]*?<\/inner_thought>/, '').trim();
      }

      // 8. Save Bot Message (Store inner_thought server-side, never render to user)
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

      // Return visible reply to client (omit inner_thought)
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
