import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';

async function getAuthUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const authCookie =
    req.cookies.get('sb-access-token') ||
    req.cookies.get('sb-lrgcwnmcscimkmslihxp-auth-token');

  const authHeader = req.headers.get('Authorization');
  const token = authCookie?.value ?? authHeader?.replace('Bearer ', '');

  if (!token) {
    return { user: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { user: null };
  }

  return { user };
}

export async function POST(req: NextRequest) {
  const { roomName, participantName, userId } = await req.json().catch(() => ({}));

  if (!roomName || !participantName || !userId) {
    return NextResponse.json(
      { error: 'roomName, participantName, and userId are required' },
      { status: 400 }
    );
  }

  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const wsUrl = process.env.LIVEKIT_WS_URL || process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      { error: 'LiveKit environment is not configured' },
      { status: 500 }
    );
  }

  const { user } = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const token = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      name: participantName,
      ttl: '1h',
    });

    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
    });

    return NextResponse.json({
      token: await token.toJwt(),
      wsUrl,
    });
  } catch (error) {
    console.error('Failed to generate LiveKit token', error);
    return NextResponse.json(
      { error: 'Failed to generate LiveKit token' },
      { status: 500 }
    );
  }
}