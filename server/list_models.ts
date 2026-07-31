import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyD2o6Dg0Nes3U8t432xIHYdPHcUv1Y8wzE';
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

async function listAllModels() {
  try {
    const list = await ai.models.list();
    console.log('Available Models:');
    for await (const m of list) {
      console.log(`- ${m.name} (${m.supportedGenerationMethods?.join(', ')})`);
    }
  } catch (e: any) {
    console.error('List models error:', e.message);
  }
}

listAllModels();
