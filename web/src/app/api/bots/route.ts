import { NextRequest, NextResponse } from 'next/server';
import { compileSystemPrompt, getAuthenticatedUser, getSupabaseAdmin } from '@/lib/server-utils';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('bots')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ bots: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const activeUser = await getAuthenticatedUser(req);
    if (!activeUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { name, avatar_url, personality, speech_style, likes_dislikes, boundaries, temperature } = body;

    if (!name || !personality) {
      return NextResponse.json({ error: 'Name and personality are required' }, { status: 400 });
    }

    const compiledPrompt = compileSystemPrompt({ name, personality, speech_style, likes_dislikes, boundaries });
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('bots')
      .insert({
        user_id: activeUser.id,
        name,
        avatar_url: avatar_url || `https://api.dicebear.com/7.x/fun-emoji/svg?seed=${encodeURIComponent(name)}`,
        personality,
        speech_style,
        likes_dislikes,
        boundaries,
        system_prompt: compiledPrompt,
        temperature: temperature ?? 0.7
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bot: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
