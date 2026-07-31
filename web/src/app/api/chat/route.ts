import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_MODEL,
  generateContentWithFallback,
  getAuthenticatedUser,
  getEmbeddingWithTimeout,
  getSupabaseAdmin,
  selectModel
} from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const activeUser = await getAuthenticatedUser(req);
    if (!activeUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { chatId, message, botId } = body;

    if (!chatId || !message || !botId) {
      return NextResponse.json({ error: 'chatId, botId and message are required' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // 1. Parallelize initial DB reads (Bot persona, Chat state, History)
    const [botRes, chatRes, historyRes] = await Promise.all([
      supabase.from('bots').select('*').eq('id', botId).maybeSingle(),
      supabase.from('chats').select('relationship_score, current_mood, summary').eq('id', chatId).maybeSingle(),
      supabase.from('messages')
        .select('sender_type, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(15)
    ]);

    const bot = botRes.data || {
      name: 'เพื่อนเอไอ 🐚',
      system_prompt: 'คุณคือตัวละครบทบาทสมมติที่เป็นเพื่อนสนิท คอยรับฟัง และพูดคุยด้วยความอบอุ่น',
      temperature: 0.7
    };
    const currentChat = chatRes.data;
    const currentScore = currentChat?.relationship_score ?? 50;
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
    let systemPrompt = (bot.system_prompt || `คุณคือ "${bot.name}" ตัวละครบทบาทสมมติ (Roleplay Bot)`) + ragContext;
    systemPrompt += `\n\n[สถานะความสัมพันธ์ปัจจุบัน]\n- ระดับความสนิทสนม: ${currentScore}/100\n- อารมณ์ล่าสุด: ${currentChat?.current_mood || 'พร้อมฟังเสมอ'}`;

    if (currentChat?.summary) {
      systemPrompt += `\n\n[สรุปเนื้อหาบทสนทนาก่อนหน้า]\n${currentChat.summary}`;
    }

    if (!systemPrompt.includes('<inner_thought>')) {
      systemPrompt += `\n\n[กฎการตอบกลับสำคัญ - Hidden Inner Thought]\nคุณต้องคิดไตร่ตรองในใจเสมอโดยใส่ไว้ในแท็ก <inner_thought>...</inner_thought> ก่อนตอบคำถามแก่ผู้ใช้เสมอ ห้ามละเลยแท็ก <inner_thought> เป็นอันขาด\nภายในแท็ก <inner_thought> คุณต้องระบุอารมณ์และระดับการเปลี่ยนแปลงความสนิทเสมอ:\n- <mood>อารมณ์สั้นๆ 1-2 คำ พร้อมอีโมจิ</mood>\n- <affection_delta>ตัวเลขการเปลี่ยนแปลงความสนิทตั้งแต่ -5 ถึง +5</affection_delta>\nความคิดในใจของคุณ...`;
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
    const formattedHistory = history.map((m: any) => ({
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

    // 8. Extraction of Hidden inner_thought, Mood, Affection Delta & Visible Reply
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
        visibleReply = fullOutput.replace(/<inner_thought>[\s\S]*/gi, '').trim();
        if (!visibleReply && rawThought) {
          const lines = rawThought.split('\n').filter(l => !l.includes('<mood>') && !l.includes('<affection_delta>'));
          if (lines.length > 0) {
            visibleReply = lines.slice(-1).join('\n').trim();
          }
        }
      }
    }

    // Clean leftover XML tags & control characters from visibleReply
    visibleReply = visibleReply
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

    const savedMsg = saveBotMsgRes.data || {
      id: `bot-msg-${Date.now()}`,
      created_at: new Date().toISOString()
    };

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

    return NextResponse.json({
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
