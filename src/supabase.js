import { createClient } from "@supabase/supabase-js";

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || "";
const publicKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || "";

export const isBackendConfigured = Boolean(projectUrl && publicKey);

let client;

export function getSupabase() {
  if (!isBackendConfigured) {
    throw new Error("Falta configurar Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY antes de iniciar sesión.");
  }
  if (!client) {
    client = createClient(projectUrl, publicKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        persistSession: false
      }
    });
  }
  return client;
}

export async function registerBusiness({ email, password, ownerName, businessName, activity, phone }) {
  const { data, error } = await getSupabase().auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: window.location.href.split("#")[0],
      data: {
        account_type: "business",
        full_name: ownerName,
        business_name: businessName,
        activity,
        contact_phone: phone
      }
    }
  });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await getSupabase().auth.signOut({ scope: "local" });
  if (error) throw error;
}

export async function loadIdentity() {
  const supabase = getSupabase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,company_id,full_name,email,role,status")
    .eq("id", sessionData.session.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.status !== "active" ||
      !["platform_admin", "owner", "administrator", "employee"].includes(profile.role)) {
    await signOut();
    throw new Error("Esta cuenta no tiene un perfil activo autorizado. Contacta al administrador.");
  }

  let company = null;
  if (profile.role !== "platform_admin") {
    if (!profile.company_id) {
      await signOut();
      throw new Error("La cuenta empresarial todavía no está asociada a un negocio.");
    }
    const { data, error } = await supabase
      .from("companies")
      .select("id,name,activity,status,currency,location")
      .eq("id", profile.company_id)
      .maybeSingle();
    if (error) throw error;
    if (!data || data.status !== "active") {
      await signOut();
      throw new Error("La empresa no está activa. Contacta al administrador.");
    }
    company = data;
  }

  return { profile, company };
}
