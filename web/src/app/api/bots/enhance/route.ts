import { NextRequest, NextResponse } from 'next/server';
import { generateContentWithFallback, ESCALATED_MODEL } from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (!prompt || !prompt.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

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

    const userContent = `โจทย์บทบาทตัวละครที่ผู้ใช้ต้องการ: "${prompt.trim()}"`;

    const res = await generateContentWithFallback(
      ESCALATED_MODEL,
      [{ role: 'user', parts: [{ text: userContent }] }],
      enhanceInstruction,
      0.8
    );

    let rawText = res.text?.trim() || '';
    // Strip markdown json wrappers if present
    rawText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

    const parsedJson = JSON.parse(rawText);

    return NextResponse.json({ success: true, persona: parsedJson });
  } catch (err: any) {
    console.error('Enhance persona error:', err);
    return NextResponse.json({ error: err?.message || 'Failed to enhance persona' }, { status: 500 });
  }
}
