import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

export function getAi() {
  const apiKey = process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey: apiKey || 'dummy_key' });
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key';
  return createClient(url, key);
}

// Model Cascade Definition
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const ESCALATED_MODEL = 'gemini-3.6-flash';
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Compile persona structured fields into unified server-side system prompt
 */
export function compileSystemPrompt(bot: {
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
export function selectModel(messageContent: string, historyCount: number): string {
  if (messageContent.length > 400 || historyCount > 20) {
    return ESCALATED_MODEL;
  }
  return DEFAULT_MODEL;
}

/**
 * Supabase Auth Bearer Token verification helper for NextRequest
 */
export async function getAuthenticatedUser(req: NextRequest) {
  const fallbackUser = { id: '00000000-0000-0000-0000-000000000000' };
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fallbackUser;
  }

  const token = authHeader.substring(7).trim();
  if (!token || token === 'null' || token === 'undefined') {
    return fallbackUser;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return fallbackUser;
    }
    return data.user;
  } catch {
    return fallbackUser;
  }
}

/**
 * Non-blocking embedding generator with strict timeout
 */
export async function getEmbeddingWithTimeout(text: string, timeoutMs: number = 1000): Promise<number[] | null> {
  try {
    const ai = getAi();
    const embedPromise = ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text
    }).then(res => {
      const r = res as any;
      return (r.embedding?.values || r.embeddings?.[0]?.values) as number[] || null;
    });

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

    return await Promise.race([embedPromise, timeoutPromise]);
  } catch (err) {
    console.warn('[EMBEDDING TIMEOUT/ERR]', err);
    return null;
  }
}

const personaCacheMap = new Map<string, { name: string; expiresAt: number }>();

async function getOrCreateCacheName(ai: any, model: string, systemInstruction: string): Promise<string | null> {
  try {
    if (!ai?.caches || !systemInstruction || systemInstruction.length < 500) return null;
    const cacheKey = `${model}:${systemInstruction.substring(0, 100)}`;
    const existing = personaCacheMap.get(cacheKey);
    if (existing && existing.expiresAt > Date.now() + 30000) {
      return existing.name;
    }

    const created = await ai.caches.create({
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
 * Generate Gemini response with automatic Context Caching & fallback model
 */
export async function generateContentWithFallback(targetModel: string, contents: any[], systemInstruction: string, temperature: number) {
  const ai = getAi();
  const cacheName = await getOrCreateCacheName(ai, targetModel, systemInstruction);

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
