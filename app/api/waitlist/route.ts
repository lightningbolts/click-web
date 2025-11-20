import { getSupabaseClient } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    // Check if Supabase is configured
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.log('Supabase not configured. Email captured:', email);
      return NextResponse.json({
        success: true,
        message: 'Successfully joined the waitlist!'
      });
    }

    // Insert into waitlist table
    const { error } = await supabase
      .from('waitlist')
      .insert({
        email
      });

    if (error) {
      // If it's a duplicate email error, return success anyway
      if (error.code === '23505') {
        return NextResponse.json({
          success: true,
          message: 'You\'re already on the waitlist!'
        });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully joined the waitlist!'
    });
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

