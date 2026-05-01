import { supabaseAdmin } from "../config/supabaseClient.js";

export async function findProfileByEmail(email) {
  const { data, error } = await supabaseAdmin.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data;
}
