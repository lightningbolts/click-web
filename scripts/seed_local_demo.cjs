#!/usr/bin/env node
/**
 * Seeds a LOCAL Supabase stack with demo data for the post-9/29 features (drops, recap, history,
 * shared drops + reactions, soundtracks, alerts, reconnect nudge) and turns their flags on for the
 * demo accounts. Refuses to run against anything but localhost.
 *
 *   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… IMG_DIR=… node scripts/seed_local_demo.cjs
 *
 * Demo sign-in (local only): demo@click.test / click-demo-2026
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const URL_ = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_)) throw new Error('Refusing to seed a non-local Supabase');
const admin = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const IMG = process.env.IMG_DIR;
const PASSWORD = 'click-demo-2026';
const H = 3_600_000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const HERE = { lat: 47.6567, lng: -122.3066 }; // Suzzallo Library, UW
const must = ({ data, error }, what) => { if (error) throw new Error(`${what}: ${error.message}`); return data; };

/** Today at `hour`:00 in Los Angeles, as epoch ms. */
function laToday(hour) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map((p) => [p.type, Number(p.value)]));
  const offsetH = parts.hour - new Date(now).getUTCHours();
  const off = ((offsetH + 36) % 24) - 12; // local minus UTC, in hours
  return Date.UTC(parts.year, parts.month - 1, parts.day, hour - off);
}

async function user(email, first, last, avatarIdx) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let u = list.users.find((x) => x.email === email);
  if (!u) u = must(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), 'user').user;
  const avatarPath = `${u.id}/avatar-demo.jpg`;
  await admin.storage.from('avatars').upload(avatarPath, fs.readFileSync(path.join(IMG, `avatar${avatarIdx}.jpg`)), { contentType: 'image/jpeg', upsert: true });
  const image = admin.storage.from('avatars').getPublicUrl(avatarPath).data.publicUrl;
  must(await admin.from('users').upsert({ id: u.id, email, name: `${first} ${last}`, first_name: first, last_name: last, image }), 'users');
  must(await admin.from('user_interests').upsert({ user_id: u.id, tags: ['Music', 'Coffee', 'Hiking', 'Film', 'Design'] }), 'interests');
  return u.id;
}

async function connect(a, b) {
  const existing = must(await admin.from('connections').select('id').contains('user_ids', [a, b]), 'conn read');
  if (existing[0]) return existing[0].id;
  return must(await admin.from('connections').insert({ user_ids: [a, b], status: 'active', created_utc: iso(now - 90 * 24 * H) }).select('id').single(), 'conn').id;
}

async function upload(prefix, n) {
  const orig = `${prefix}${now}${n}-${Math.random().toString(16).slice(2, 10).padEnd(8, '0')}-original.jpg`;
  const prev = orig.replace('-original.', '-preview.');
  await admin.storage.from('click-drops').upload(orig, fs.readFileSync(path.join(IMG, `photo${n}.jpg`)), { contentType: 'image/jpeg', upsert: true });
  await admin.storage.from('click-drops').upload(prev, fs.readFileSync(path.join(IMG, `preview${n}.jpg`)), { contentType: 'image/jpeg', upsert: true });
  return { original_path: orig, preview_path: prev };
}

async function beacon(creator, type, metadata, extra = {}) {
  return must(await admin.from('map_beacons').insert({
    creator_id: creator, beacon_type: type, metadata,
    location: `SRID=4326;POINT(${HERE.lng + (extra.dLng ?? 0)} ${HERE.lat + (extra.dLat ?? 0)})`,
    expires_at: extra.expires_at ?? iso(now + 24 * H), ...(extra.columns ?? {}),
  }).select('id').single(), `beacon ${type}`).id;
}

async function event(creator, title, startMs, endMs) {
  const meta = { title, event_start_at: iso(startMs), event_end_at: iso(endMs), event_timezone: 'America/Los_Angeles', location_name: 'Suzzallo Library' };
  return beacon(creator, 'event', meta, { expires_at: iso(endMs), columns: { starts_at: iso(startMs), ends_at: iso(endMs), event_timezone: 'America/Los_Angeles' } });
}

(async () => {
  const me = await user('demo@click.test', 'Alex', 'Rivera', 1);
  const maya = await user('maya@click.test', 'Maya', 'Chen', 2);
  const sam = await user('sam@click.test', 'Sam', 'Patel', 3);
  const jordan = await user('jordan@click.test', 'Jordan', 'Lee', 4);
  const priya = await user('priya@click.test', 'Priya', 'Nair', 5);
  const everyone = [me, maya, sam, jordan, priya];
  const [cMaya, cSam, cJordan] = [await connect(me, maya), await connect(me, sam), await connect(me, jordan)];
  await connect(maya, sam);
  await admin.from('connection_core').upsert([{ user_id: me, connection_id: cMaya }, { user_id: maya, connection_id: cMaya }]);

  // Flags on for the demo accounts.
  must(await admin.from('feature_flags').update({ enabled: true, allow_user_ids: everyone }).neq('key', ''), 'flags');

  // F1: last night's launch party, revealed at 10:00 this morning.
  const partyStart = laToday(18) - 24 * H;
  const party = await event(priya, 'Fall Launch Party', partyStart, partyStart + 3 * H);
  const reveal = iso(laToday(10));
  for (const u of [me, maya, sam]) await admin.from('event_check_ins').upsert({ user_id: u, beacon_id: party });
  await admin.from('beacon_attendees').upsert([me, maya, sam, jordan].map((u) => ({ beacon_id: party, user_id: u })));
  const drops = [[me, 1], [maya, 2], [maya, 3], [sam, 4], [me, 5], [maya, 6], [sam, 7]];
  for (const [u, n] of drops) {
    must(await admin.from('event_drops').insert({ beacon_id: party, user_id: u, client_drop_id: crypto.randomUUID(), filter_seed: n * 7919,
      reveal_at: reveal, created_at: iso(partyStart + n * 20 * 60_000), ...(await upload(`event/${party}/${u}/`, n)) }), 'event drop');
  }
  await admin.from('event_drop_recaps').upsert({ beacon_id: party, reveal_at: reveal, notified_at: iso(now) });

  // F1: a study jam happening now; Alex is checked in with one drop developing.
  const jam = await event(maya, 'Study Jam', now - H, now + 2 * H);
  await admin.from('event_check_ins').upsert({ user_id: me, beacon_id: jam });
  must(await admin.from('event_drops').insert({ beacon_id: jam, user_id: me, client_drop_id: crypto.randomUUID(), filter_seed: 11,
    reveal_at: iso(laToday(10) + 24 * H), ...(await upload(`event/${jam}/${me}/`, 8)) }), 'jam drop');

  // F2: older history — an RSVP, a saved one, and one Alex hosted.
  const hosted = await event(me, 'Sunset Picnic', now - 10 * 24 * H, now - 10 * 24 * H + 2 * H);
  const rsvp = await event(sam, 'Indie Film Night', now - 6 * 24 * H, now - 6 * 24 * H + 3 * H);
  await admin.from('beacon_attendees').upsert({ beacon_id: rsvp, user_id: me });
  const upcoming = await event(jordan, 'Climbing Meetup', now + 3 * 24 * H, now + 3 * 24 * H + 2 * H);
  await admin.from('event_bookmarks').upsert([{ user_id: me, beacon_id: upcoming }, { user_id: me, beacon_id: hosted }]);

  // F5 + reactions: Maya's soundtrack; Jordan is listening; Sam reacted.
  const track = await beacon(maya, 'soundtrack', { title: 'Espresso', track_name: 'Espresso', artist_name: 'Sabrina Carpenter',
    music_url: 'https://open.spotify.com/track/2qSkIjg1o9h3YT9RAgYN75', location_name: 'The Ave' }, { dLat: 0.002, expires_at: iso(now + 5 * 24 * H) });
  await admin.from('beacon_presence').upsert([{ beacon_id: track, user_id: jordan }, { beacon_id: track, user_id: priya }]);
  await admin.from('reactions').upsert({ target_kind: 'soundtrack', target_id: track, user_id: sam, emoji: '🔥' });
  await admin.from('reactions').upsert({ target_kind: 'soundtrack', target_id: track, user_id: me, emoji: '😍' });

  // F4: an alert nearby.
  await beacon(sam, 'hazard', { title: 'Sidewalk closed', description: 'Construction on the Ave' }, { dLat: -0.001, expires_at: iso(now + H) });

  // F3: shared drops — developed, ready, pending, and Alex's own with reactions.
  const share = async (u, n, audience, revealMs, createdMs) => must(await admin.from('shared_drops').insert({ user_id: u, audience,
    client_drop_id: crypto.randomUUID(), reveal_at: iso(revealMs), created_at: iso(createdMs), ...(await upload(`shared/${u}/${u}/`, n)) }).select('id').single(), 'shared').id;
  await share(maya, 9, 'core', now - 2 * H, now - 26 * H);
  await share(sam, 3, 'all', now - 20 * 60_000, now - 24 * H - 20 * 60_000);
  await share(jordan, 5, 'all', now + 5 * H, now - 19 * H);
  const mine = await share(me, 2, 'all', now - 30 * H, now - 54 * H);
  await admin.from('drop_views').upsert({ drop_kind: 'shared', drop_id: mine, viewer_id: me });
  await admin.from('reactions').upsert([{ target_kind: 'shared_drop', target_id: mine, user_id: maya, emoji: '😍' },
    { target_kind: 'shared_drop', target_id: mine, user_id: sam, emoji: '🔥' }]);

  // History: a hangout with Maya, an alert Alex confirmed.
  await admin.from('hangout_confirmations').insert({ connection_id: cMaya, user_ids: [me, maya], confirmed_user_ids: [me, maya], source: 'manual',
    occurred_at: iso(now - 5 * 24 * H), location_name: 'Cafe Allegro', status: 'confirmed', expires_at: iso(now - 4 * 24 * H), resolved_at: iso(now - 5 * 24 * H) });

  // F6: Alex met Jordan right here in June.
  await admin.from('connection_encounters').insert({ connection_id: cJordan, encountered_at: iso(now - 105 * 24 * H), gps_lat: HERE.lat, gps_lon: HERE.lng, location_name: 'Suzzallo Library' });
  await admin.from('connection_encounters').insert({ connection_id: cSam, encountered_at: iso(now - 30 * 24 * H), gps_lat: 47.61, gps_lon: -122.33, location_name: 'Capitol Hill' });
  console.log('Seeded. Demo sign-in: demo@click.test (see script header).', { me, party, jam, track });
})().catch((e) => { console.error(e); process.exit(1); });
