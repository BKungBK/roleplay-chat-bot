import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nmghriwtynqkwrzgigkb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZ2hyaXd0eW5xa3dyemdpZ2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ2ODU5NiwiZXhwIjoyMTAxMDQ0NTk2fQ.6pPLWsFa3V0D_CsmwAolMSeekvCdMCQCWpcKcf5FwBA';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runTest() {
  console.log('1. Fetching Bot ID from Supabase...');
  const { data: bots } = await supabaseAdmin.from('bots').select('*').limit(1);
  const botId = bots[0].id;
  console.log('✅ Bot ID:', botId);

  console.log('\n2. Admin Creating / Fetching Verified User for Auth Session...');
  const testEmail = 'roleplay.tester.2026@gmail.com';
  const testPass = 'RoleplayPassword123!';

  const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
    email: testEmail,
    password: testPass
  });

  const token = signInData?.session?.access_token;
  console.log('✅ User Auth Token obtained:', token ? token.substring(0, 30) + '...' : 'NULL');

  console.log('\n3. Testing Real Chat Creation (POST /api/chats)...');
  const chatRes = await fetch('http://localhost:3001/api/chats', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ botId })
  });

  const chatText = await chatRes.text();
  console.log('Chat Creation Response Status:', chatRes.status, 'Body:', chatText);

  const chatData = JSON.parse(chatText);
  const realChatId = chatData.chatId;

  console.log('\n4. Testing Roleplay Turn with Vector RAG & Memory Extraction (POST /api/chat)...');
  const chatTurnRes = await fetch('http://localhost:3001/api/chat', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      chatId: realChatId,
      botId: botId,
      message: 'สวัสดีครับ ผมชื่อสมชาย ผมชอบฟังเสียงคลื่นทะเล และชอบดื่มกาแฟส้มยามเช้าครับ'
    })
  });

  const chatTurnText = await chatTurnRes.text();
  console.log('Chat Turn Response Status:', chatTurnRes.status, 'Body:', chatTurnText);
}

runTest().catch(console.error);
