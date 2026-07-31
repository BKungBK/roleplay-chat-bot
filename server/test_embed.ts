import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD2o6Dg0Nes3U8t432xIHYdPHcUv1Y8wzE';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function testEmbed() {
  try {
    const res = await ai.models.embedContent({
      model: 'gemini-embedding-2',
      contents: 'สวัสดีครับ'
    });
    console.log('✅ Success for gemini-embedding-2! Vector length:', res.embedding?.values?.length);
  } catch (e: any) {
    console.log('❌ Failed for gemini-embedding-2:', e.message);
  }
}

testEmbed();
