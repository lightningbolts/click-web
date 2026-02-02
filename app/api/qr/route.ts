import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * QR Code Connection API
 * Generates a connection protocol URL that can be scanned by the Click mobile app
 * 
 * The URL format is: {baseUrl}/connect/{userId}
 * This endpoint validates the user and returns the proper connection URL
 */

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    
    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Get the current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // Get the base URL from the request or environment
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
                   (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                   request.nextUrl.origin);

    // Generate the connection URL
    // This URL is what the Click mobile app will scan to initiate a connection
    const connectionUrl = `${baseUrl}/connect/${user.id}`;
    
    // Generate a short Click ID for display
    const clickId = `CLICK-${user.id.substring(0, 8).toUpperCase()}`;

    // Return the connection data
    return NextResponse.json({
      success: true,
      data: {
        userId: user.id,
        clickId: clickId,
        connectionUrl: connectionUrl,
        // Deep link format for the mobile app
        deepLink: `click://connect/${user.id}`,
        // Universal link format
        universalLink: connectionUrl,
        // User info for display
        userName: user.user_metadata?.full_name || null,
        userEmail: user.email,
      }
    });
    
  } catch (error) {
    console.error('QR API Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to verify a scanned QR code and initiate connection
 * This would be called by the mobile app when scanning another user's QR code
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const body = await request.json();
    const { targetUserId } = body;

    if (!targetUserId) {
      return NextResponse.json(
        { error: 'Missing targetUserId' },
        { status: 400 }
      );
    }

    // Create Supabase client
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    // Get the current user (the one scanning)
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in' },
        { status: 401 }
      );
    }

    // Prevent self-connection
    if (user.id === targetUserId) {
      return NextResponse.json(
        { error: 'Cannot connect with yourself' },
        { status: 400 }
      );
    }

    // Verify the target user exists
    const { data: targetUser, error: targetError } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', targetUserId)
      .single();

    if (targetError || !targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Return success - the actual connection creation is handled by the mobile app
    // which has access to geolocation data
    return NextResponse.json({
      success: true,
      data: {
        targetUserId: targetUserId,
        targetUserName: targetUser.full_name || 'Click User',
        initiatorId: user.id,
        message: 'Ready to create connection',
      }
    });
    
  } catch (error) {
    console.error('QR Verify Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
