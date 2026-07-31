import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_MODEL,
  generateContentWithFallback,
  getAuthenticatedUser,
  getEmbeddingWithTimeout,
  selectModel,
  supabaseAdmin
} from '@/lib/server-utils';

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

    // 1. Parallelize initial DB reads (Bot persona, Chat state, History)
    const [botRes, chatRes, historyRes] = await Promise.all([
      supabaseAdmin.from('bots').select('*').eq('id', botId).single(),
      supabaseAdmin.from('chats').select('relationship_score, current_mood, summary').eq('id', chatId).single(),
      supabaseAdmin.from('messages')
        .select('sender_type, content')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: false })
        .limit(15)
    ]);

    if (botRes.error || !botRes.data) {
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 });
    }

    const bot = botRes.data;
    const currentChat = chatRes.data;
    const currentScore = currentChat?.relationship_score ?? 50;
    const rawHistory = historyRes.data || [];
    const history = rawHistory.reverse();

    // 2. Fast Non-blocking RAG Memory Retrieval (with strict 1.0s timeout)
    let ragContext = '';
    const userEmbedding = await getEmbeddingWithTimeout(message, 1000);
    if (userEmbedding) {
      try {
        const { data: memories } = await supabaseAdmin.rpc('match_memories', {
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
    let systemPrompt = (bot.system_prompt || '') + ragContext;
    systemPrompt += `\n\n[สถานะความสัมพันธ์ปัจจุบัน]\n- ระดับความสนิทสนม: ${currentScore}/100\n- อารมณ์ล่าสุด: ${currentChat?.current_mood || 'พร้อมฟังเสมอ'}`;

    if (currentChat?.summary) {
      systemPrompt += `\n\n[สรุปเนื้อหาบทสนทนาก่อนหน้า]\n${currentChat.summary}`;
    }

    // 4. Save User Message asynchronously alongside prompt prep
    const saveUserMsgPromise = supabaseAdmin.from('messages').insert({
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
      supabaseAdmin.from('chats').update({
        relationship_score: newScore,
        current_mood: extractedMood,
        updated_at: new Date().toISOString()
      }).eq('id', chatId),
      supabaseAdmin.from('messages').insert({
        chat_id: chatId,
        sender_type: 'bot',
        content: visibleReply,
        inner_thought: innerThought,
        model_used: targetModel
      }).select().single()
    ]);

    if (saveBotMsgRes.error) {
      return NextResponse.json({ error: saveBotMsgRes.error.message }, { status: 500 });
    }
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
            await supabaseAdmin.from('memories').insert({
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
