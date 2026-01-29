import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/client';

// POST /api/developers - Register a developer with API key
export async function POST(request: Request) {
  try {
    const { apiKey, name, deviceId, email } = await request.json();
    
    if (!apiKey || !name || !deviceId) {
      return NextResponse.json(
        { error: 'API key, name, and device ID are required' },
        { status: 400 }
      );
    }
    
    const supabase = createServerClient();
    
    // Use the register_developer function
    const { data, error } = await supabase.rpc('register_developer', {
      p_api_key: apiKey,
      p_name: name,
      p_device_id: deviceId,
      p_email: email || null,
    });
    
    if (error) throw error;
    
    if (!data || data.length === 0 || !data[0].success) {
      return NextResponse.json(
        { error: data?.[0]?.message || 'Registration failed' },
        { status: 401 }
      );
    }
    
    return NextResponse.json({
      success: true,
      developerId: data[0].developer_id,
      teamId: data[0].team_id,
      message: data[0].message,
    });
    
  } catch (error: any) {
    console.error('Error registering developer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to register developer' },
      { status: 500 }
    );
  }
}

// PUT /api/developers - Update developer status (online/offline)
export async function PUT(request: Request) {
  try {
    const { apiKey, deviceId, isOnline } = await request.json();
    
    if (!apiKey || !deviceId) {
      return NextResponse.json(
        { error: 'API key and device ID are required' },
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
    
    // Update developer status
    const { error } = await supabase
      .from('developers')
      .update({
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('team_id', validation[0].team_id)
      .eq('device_id', deviceId);
    
    if (error) throw error;
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error updating developer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update developer' },
      { status: 500 }
    );
  }
}
