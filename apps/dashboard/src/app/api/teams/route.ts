import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// POST /api/teams - Create a new team
export async function POST(request: Request) {
  try {
    const { name, email } = await request.json();
    
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required' },
        { status: 400 }
      );
    }
    
    const supabase = createServerClient();
    
    // Create team
    const { data: team, error: teamError } = await supabase
      .from('teams')
      .insert({ name, email })
      .select()
      .single();
    
    if (teamError) {
      if (teamError.code === '23505') {
        return NextResponse.json(
          { error: 'Email already registered' },
          { status: 409 }
        );
      }
      throw teamError;
    }
    
    // Generate API key
    const { data: apiKeyValue } = await supabase.rpc('generate_api_key');
    
    // Create API key (expires in 30 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);
    
    const { data: apiKey, error: keyError } = await supabase
      .from('api_keys')
      .insert({
        team_id: team.id,
        key: apiKeyValue,
        expires_at: expiresAt.toISOString(),
        is_active: true,
      })
      .select()
      .single();
    
    if (keyError) throw keyError;
    
    // Create free subscription
    const { error: subError } = await supabase
      .from('subscriptions')
      .insert({
        team_id: team.id,
        plan: 'free',
        status: 'active',
        current_period_end: expiresAt.toISOString(),
      });
    
    if (subError) throw subError;
    
    return NextResponse.json({
      success: true,
      team: {
        id: team.id,
        name: team.name,
        email: team.email,
      },
      apiKey: {
        key: apiKey.key,
        expiresAt: apiKey.expires_at,
      },
    });
    
  } catch (error: any) {
    console.error('Error creating team:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create team' },
      { status: 500 }
    );
  }
}

// GET /api/teams?apiKey=xxx - Get team info
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const apiKey = searchParams.get('apiKey');
    
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key required' },
        { status: 400 }
      );
    }
    
    const supabase = createServerClient();
    
    // Validate API key
    const { data: validation } = await supabase
      .rpc('validate_api_key', { p_key: apiKey });
    
    if (!validation || validation.length === 0 || !validation[0].is_valid) {
      return NextResponse.json(
        { error: 'Invalid or expired API key' },
        { status: 401 }
      );
    }
    
    const teamId = validation[0].team_id;
    
    // Get team with developers
    const { data: team } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .single();
    
    const { data: developers } = await supabase
      .from('developers')
      .select('*')
      .eq('team_id', teamId)
      .order('last_seen_at', { ascending: false });
    
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('team_id', teamId)
      .single();
    
    return NextResponse.json({
      team,
      developers: developers || [],
      subscription,
      apiKeyExpiresAt: validation[0].expires_at,
    });
    
  } catch (error: any) {
    console.error('Error getting team:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get team' },
      { status: 500 }
    );
  }
}
