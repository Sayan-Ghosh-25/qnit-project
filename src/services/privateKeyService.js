// src/services/privateKeyService.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function requestPrivateKey(applicantEmail) {
  const { data, error } = await supabase.functions.invoke("private-key", {
    body: { applicant: applicantEmail },
  });

  if (error) throw new Error(error.message);
  return data;
}
