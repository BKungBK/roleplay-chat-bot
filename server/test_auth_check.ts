import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://nmghriwtynqkwrzgigkb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZ2hyaXd0eW5xa3dyemdpZ2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Njg1OTYsImV4cCI6MjEwMTA0NDU5Nn0.CoyncADSSZBEPNU_NiS7LsyYaB-wP-DAoBqVMBqwSDk';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZ2hyaXd0eW5xa3dyemdpZ2tiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQ2ODU5NiwiZXhwIjoyMTAxMDQ0NTk2fQ.6pPLWsFa3V0D_CsmwAolMSeekvCdMCQCWpcKcf5FwBA';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test() {
  const { data: signInData } = await supabaseAdmin.auth.signInWithPassword({
    email: 'roleplay.tester.2026@gmail.com',
    password: 'RoleplayPassword123!'
  });

  const token = signInData?.session?.access_token;
  console.log('Token length:', token?.length);

  const res1 = await supabaseAdmin.auth.getUser(token);
  console.log('Admin client getUser:', { user: res1.data?.user?.id, error: res1.error?.message });

  const res2 = await supabaseAnon.auth.getUser(token);
  console.log('Anon client getUser:', { user: res2.data?.user?.id, error: res2.error?.message });
}

test();
