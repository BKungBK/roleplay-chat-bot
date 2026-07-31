import { GoogleGenAI } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Initialize Clients
export const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Model Cascade Definition
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const ESCALATED_MODEL = 'gemini-3.6-flash';
export const EMBEDDING_MODEL = 'gemini-embedding-001';

/**
 * Compile persona structured fields into unified server-side system prompt
 */
export function compileSystemPrompt(bot: {
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
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) {
    return null;
  }
  return data.user;
}

/**
 * Non-blocking embedding generator with strict timeout
 */
export async function getEmbeddingWithTimeout(text: string, timeoutMs: number = 1000): Promise<number[] | null> {
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
 * Generate Gemini response with automatic fallback model
 */
export async function generateContentWithFallback(targetModel: string, contents: any[], systemInstruction: string, temperature: number) {
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
