import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nmghriwtynqkwrzgigkb.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZ2hyaXd0eW5xa3dyemdpZ2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ2ODU5NiwiZXhwIjoyMTAxMDQ0NTk2fQ.6pPLWsFa3V0D_CsmwAolMSeekvCdMCQCWpcKcf5FwBA';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function test() {
  const testEmail = 'roleplay.tester.2026@gmail.com';
  const testPass = 'RoleplayPassword123!';

  const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
    email: testEmail,
    password: testPass
  });

  const token = signInData?.session?.access_token;
  console.log('Token length:', token?.length);

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  console.log('getUser result:', { userId: data?.user?.id, error });
}

test();
