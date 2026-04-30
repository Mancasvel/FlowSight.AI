import { createClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://dzpyrdxelcgfpmcdojvb.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_Ky02yQS5HHpkmrN1DE2yaw_EwENlsPZ';

const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

let supabaseClient = null;

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase public configuration is missing.');
  }

  if (!supabaseClient) {
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }

  return supabaseClient;
}

export function getFriendlyAuthError(error) {
  const message = String(error?.message || error || '').toLowerCase();

  if (message.includes('invalid login credentials')) {
    return 'Invalid email or password. Please check the credentials from your PM.';
  }

  if (message.includes('email not confirmed')) {
    return 'Please confirm your email before signing in.';
  }

  if (message.includes('supabase public configuration')) {
    return 'Login is not configured yet. Please contact your PM.';
  }

  return 'Login failed. Please try again or contact your PM.';
}

async function rejectSignedInUser(supabase, message) {
  await supabase.auth.signOut();
  throw new Error(message);
}

export async function signInWorker(email, password) {
  const supabase = getSupabaseClient();
  const normalizedEmail = email.trim();

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (signInError) {
    throw new Error(getFriendlyAuthError(signInError));
  }

  if (!signInData.session) {
    throw new Error('Login failed. Please try again or contact your PM.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) {
    return rejectSignedInUser(supabase, 'We could not identify this account. Please try again.');
  }

  const user = userData.user;
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, display_name, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    return rejectSignedInUser(supabase, 'We could not load your worker profile. Please contact your PM.');
  }

  if (!profile) {
    return rejectSignedInUser(supabase, 'This account does not have a worker profile yet.');
  }

  if (profile.role !== 'worker') {
    return rejectSignedInUser(supabase, 'This account is not registered as a worker.');
  }

  const { data: memberships, error: membershipError } = await supabase
    .from('team_members')
    .select('team_id, role')
    .eq('user_id', user.id);

  if (membershipError) {
    return rejectSignedInUser(supabase, 'We could not load your team membership. Please contact your PM.');
  }

  if (!memberships || memberships.length === 0) {
    return rejectSignedInUser(supabase, 'This account is not assigned to a team yet.');
  }

  return {
    session: signInData.session,
    user,
    profile,
    membership: memberships[0],
    memberships,
  };
}

export async function signOutWorker() {
  const supabase = getSupabaseClient();
  await supabase.auth.signOut();
}
