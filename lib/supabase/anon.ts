import { createClient } from "@supabase/supabase-js";

export function createAnonClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL veya SUPABASE_ANON_KEY eksik");
  }
  return createClient(url, key);
}
