import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://bcqhpfeayouogftdolml.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_NyQP_XOC_QWM4uYJfSg_dA_fvhNJO_S";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});
