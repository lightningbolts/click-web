import { getSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, source, referrer_user_id } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('Supabase not configured. Email captured:', email);
      return NextResponse.json({
        success: true,
        message: 'Successfully joined the waitlist!'
      });
    }

    // Insert into waitlist table with attribution data
    const { error } = await supabase
      .from('waitlist')
      .insert({
        email,
        source: source || 'website',
        referrer_user_id: referrer_user_id || null,
      });

    if (error) {
      // Duplicate email — still success from user perspective
      if (error.code === '23505') {
        return NextResponse.json({
          success: true,
          message: 'You\'re already on the waitlist!'
        });
      }
      console.error('Waitlist insert error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully joined the waitlist!'
    });
  } catch (error) {
    console.error('Waitlist API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
