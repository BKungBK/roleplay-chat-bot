import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, supabaseAdmin } from '@/lib/server-utils';

export async function POST(req: NextRequest) {
  try {
    const activeUser = await getAuthenticatedUser(req);
    if (!activeUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { botId, title } = body;

    if (!botId) {
      return NextResponse.json({ error: 'botId is required' }, { status: 400 });
    }

    const { data: chat, error } = await supabaseAdmin
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

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, chatId: chat.id, chat });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
