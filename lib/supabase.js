import { createClient } from "@supabase/supabase-js"
import { supabaseConfig } from "./config"

// Solo crear cliente si la URL es válida (https://...)
const isValidUrl = supabaseConfig.url && supabaseConfig.url.startsWith('http');

export const supabase = isValidUrl 
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

export const isSupabaseConfigured = isValidUrl;
