import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nmghriwtynqkwrzgigkb.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tZ2hyaXd0eW5xa3dyemdpZ2tiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0Njg1OTYsImV4cCI6MjEwMTA0NDU5Nn0.CoyncADSSZBEPNU_NiS7LsyYaB-wP-DAoBqVMBqwSDk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
