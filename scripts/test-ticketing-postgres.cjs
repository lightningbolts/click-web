/* Real multi-connection PostgreSQL tests. Creates and drops a uniquely named LOCAL database.
 * TICKETING_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:55439/postgres
 * npm run test:ticketing:postgres
 */
const { Pool, Client } = require('pg');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const url = new URL(
  process.env.TICKETING_TEST_DATABASE_URL || 'postgresql://postgres@127.0.0.1:55439/postgres',
);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  throw new Error('Tests require local disposable PostgreSQL; remote databases are refused');
const database = 'click_ticketing_test_' + randomUUID().replaceAll('-', '');
const root = path.resolve(__dirname, '..');
let pool;
let assertions = 0;
async function main() {
  const control = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  await control.connect();
  try {
    // Roles are shared by databases. Leave existing application roles untouched.
    for (const role of ['anon', 'authenticated', 'service_role'])
      await control.query(
        `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='${role}') THEN CREATE ROLE ${role}; END IF; END $$`,
      );
    await control.query(`CREATE DATABASE ${database}`);
    url.pathname = '/' + database;
    pool = new Pool({ connectionString: url.toString(), max: 12 });
    await pool.query(fs.readFileSync(path.join(__dirname, 'ticketing-test-schema.sql'), 'utf8'));
    for (const name of [
      '20260919120000_ticketing_foundation.sql',
      '20260921120000_ticketing_security_and_ui_support.sql',
    ])
      await pool.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
    const query = (text, values) => pool.query(text, values);
    const rpc = async (name, args) => {
      const { rows } = await query(
        `SELECT public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) AS result`,
        args,
      );
      return rows[0].result;
    };
    const check = (condition, label) => {
      assert.ok(condition, label);
      assertions++;
      console.log('PASS ' + label);
    };
    async function fixture(capacity = 1, max = 20) {
      const host = randomUUID(),
        buyer = randomUUID(),
        other = randomUUID(),
        event = randomUUID(),
        tier = randomUUID(),
        account = randomUUID();
      await query('INSERT INTO auth.users(id) VALUES($1),($2),($3)', [host, buyer, other]);
      await query("INSERT INTO users(id,name) VALUES($1,'Host'),($2,'Buyer'),($3,'Other')", [
        host,
        buyer,
        other,
      ]);
      await query(
        "INSERT INTO organizer_payment_accounts(id,owner_user_id,stripe_account_id,onboarding_state,charges_enabled,payouts_enabled,transfers_enabled) VALUES($1,$2,$3,'ready',true,true,true)",
        [account, host, 'acct_' + account],
      );
      await query(
        "INSERT INTO map_beacons(id,creator_id,admission_type,ticketing_status,financial_principal_id,organizer_payment_account_id) VALUES($1,$2,'paid','sales_open',$2,$3)",
        [event, host, account],
      );
      await query(
        "INSERT INTO ticket_tiers(id,beacon_id,name,unit_amount,capacity,max_per_order,max_per_user) VALUES($1,$2,'General',1000,$3,20,$4)",
        [tier, event, capacity, max],
      );
      return { host, buyer, other, event, tier, account };
    }
    const reserve = (f, buyer = f.buyer, attempt = randomUUID(), quantity = 1) =>
      rpc('ticketing_reserve_order', [
        buyer,
        attempt,
        f.event,
        JSON.stringify([{ tier_id: f.tier, quantity, expected_unit_amount: 1000 }]),
        'usd',
        1000 * quantity,
        100 * quantity,
        1000 * quantity,
        '{}',
        32,
      ]);
    const mint = (f, order, quantity = 1) =>
      rpc('ticketing_fulfill_order', [
        order,
        'cs_' + order,
        'pi_' + order,
        'ch_' + order,
        1000 * quantity,
        'usd',
        JSON.stringify(
          Array.from({ length: quantity }, (_, i) => ({
            tier_id: f.tier,
            ordinal: i + 1,
            ticket_number: randomUUID(),
            token_hash: randomUUID(),
          })),
        ),
      ]);
    let f = await fixture();
    let results = await Promise.all([reserve(f), reserve(f, f.other)]);
    check(
      results.filter((r) => r.ok).length === 1 &&
        results.some((r) => r.code === 'insufficient_inventory'),
      'two buyers competing for the final ticket',
    );
    f = await fixture(20);
    const attempt = randomUUID();
    results = await Promise.all(Array.from({ length: 8 }, () => reserve(f, f.buyer, attempt)));
    check(
      results.every((r) => r.ok) && new Set(results.map((r) => r.order_id)).size === 1,
      'eight concurrent retries reuse one order',
    );
    check(
      (await reserve(f, f.buyer, attempt, 2)).code === 'attempt_conflict',
      'attempt cannot change its basket',
    );
    f = await fixture(20, 1);
    results = await Promise.all([reserve(f), reserve(f)]);
    check(
      results.filter((r) => r.ok).length === 1 && results.some((r) => r.code === 'over_user_limit'),
      'active holds count against maximum per user',
    );
    f = await fixture();
    const held = await reserve(f);
    await query(
      "UPDATE ticket_inventory_holds SET expires_at=now()-interval '1 day' WHERE order_id=$1",
      [held.order_id],
    );
    check(
      (await reserve(f, f.other)).code === 'insufficient_inventory',
      'clock expiry alone never releases inventory',
    );
    check((await rpc('ticketing_expire_stale', [])) === 0, 'legacy clock-only sweep is inert');
    results = await Promise.all([mint(f, held.order_id), mint(f, held.order_id)]);
    check(
      results.every((r) => r.ok),
      'duplicate late paid delivery fulfills idempotently',
    );
    let tickets = (await query('SELECT * FROM tickets WHERE order_id=$1', [held.order_id])).rows;
    check(tickets.length === 1, 'duplicate fulfillment mints exactly one ticket');
    for (const statement of [
      "INSERT INTO beacon_attendees(beacon_id,user_id,source) VALUES($1,$2,'ticket')",
      "UPDATE beacon_attendees SET source='web' WHERE beacon_id=$1 AND user_id=$2",
      'DELETE FROM beacon_attendees WHERE beacon_id=$1 AND user_id=$2',
    ]) {
      await assert.rejects(query(statement, [f.event, f.buyer]), /ticket_required/);
      assertions++;
    }
    check(true, 'paid admission rejects direct RSVP insert, provenance overwrite and cancellation');
    results = await Promise.all([
      rpc('ticketing_check_in', [f.event, tickets[0].qr_token_hash, f.host, null]),
      rpc('ticketing_check_in', [f.event, tickets[0].qr_token_hash, f.host, null]),
    ]);
    check(
      results.filter((r) => r.result === 'accepted').length === 1 &&
        results.filter((r) => r.result === 'already_checked_in').length === 1,
      'concurrent scans accept exactly once',
    );
    const wrong = await fixture();
    await query('UPDATE map_beacons SET creator_id=$1 WHERE id=$2', [f.host, wrong.event]);
    const result = await rpc('ticketing_check_in', [
      wrong.event,
      tickets[0].qr_token_hash,
      f.host,
      null,
    ]);
    check(
      result.result === 'wrong_event' && !result.attendee_name && !result.ticket_id,
      'wrong-event scan has no attendee identity',
    );
    check(
      (await rpc('ticketing_check_in', [f.event, tickets[0].qr_token_hash, f.other, null])).code ===
        'forbidden',
      'nonstaff scan denied inside database',
    );
    for (const quantity of [6, 8]) {
      f = await fixture(20);
      const order = await reserve(f, f.buyer, randomUUID(), quantity);
      await mint(f, order.order_id, quantity);
      tickets = (
        await query('SELECT * FROM tickets WHERE order_id=$1 ORDER BY id', [order.order_id])
      ).rows;
      const request = randomUUID();
      results = await Promise.all([
        rpc('ticketing_claim_refund', [
          request,
          order.order_id,
          f.host,
          tickets.map((t) => t.id),
          'test',
        ]),
        rpc('ticketing_claim_refund', [
          randomUUID(),
          order.order_id,
          f.host,
          [tickets[0].id],
          'overlap',
        ]),
      ]);
      check(
        results.filter((r) => r.ok).length === 1,
        'overlapping ' + quantity + '-ticket refunds are claimed once',
      );
      const claim = results.find((r) => r.ok).refund;
      const retry = await rpc('ticketing_claim_refund', [
        claim.id,
        order.order_id,
        f.host,
        claim.ticket_ids,
        claim.reason,
      ]);
      check(retry.refund.id === claim.id, 'durable refund retry reuses claim');
      const applied = await rpc('ticketing_apply_refund', [
        order.order_id,
        claim.id,
        're_' + claim.id,
        claim.amount,
        'succeeded',
        claim.ticket_ids,
      ]);
      check(applied.ok, 'refund reconciliation for ' + quantity + '-ticket order');
      const duplicate = await rpc('ticketing_apply_refund', [
        order.order_id,
        claim.id,
        're_' + claim.id,
        claim.amount,
        'pending',
        claim.ticket_ids,
      ]);
      check(duplicate.status === 'succeeded', 'stale pending refund cannot reverse success');
      check(
        (
          await rpc('ticketing_check_in', [
            f.event,
            tickets.find((t) => claim.ticket_ids.includes(t.id)).qr_token_hash,
            f.host,
            null,
          ])
        ).result === 'void',
        'refunded ticket cannot check in',
      );
      check(
        (await mint(f, order.order_id, quantity)).ok,
        'late duplicate payment delivery cannot remint refunded tickets',
      );
      const remaining = tickets.filter((t) => !claim.ticket_ids.includes(t.id)).map((t) => t.id);
      if (remaining.length) {
        const rest = await rpc('ticketing_claim_refund', [
          randomUUID(),
          order.order_id,
          f.host,
          remaining,
          'remaining',
        ]);
        await rpc('ticketing_apply_refund', [
          order.order_id,
          rest.refund.id,
          're_' + rest.refund.id,
          rest.refund.amount,
          'succeeded',
          remaining,
        ]);
      }
      check(
        (
          await query(
            "SELECT count(*)::int n FROM tickets WHERE order_id=$1 AND status='refunded'",
            [order.order_id],
          )
        ).rows[0].n === quantity,
        'all ' + quantity + ' tickets are refunded exactly once',
      );
      check(
        (
          await query(
            'SELECT count(*)::int n FROM beacon_attendees WHERE beacon_id=$1 AND user_id=$2',
            [f.event, f.buyer],
          )
        ).rows[0].n === 0,
        'full refund removes paid admission regardless of source',
      );
    }
    f = await fixture();
    await query("UPDATE map_beacons SET event_visibility='invite_only' WHERE id=$1", [f.event]);
    check(
      (await reserve(f)).code === 'invitation_required',
      'uninvited buyer rejected in reservation transaction',
    );
    const list = randomUUID();
    await query('INSERT INTO event_guest_lists(id,beacon_id) VALUES($1,$2)', [list, f.event]);
    await query('INSERT INTO event_guest_list_entries VALUES($1,$2)', [list, f.buyer]);
    check((await reserve(f)).ok, 'matched invitation permits ticket purchase');
    const venue = randomUUID();
    await query('UPDATE map_beacons SET venue_id=$1 WHERE id=$2', [venue, f.event]);
    await query('INSERT INTO venue_managers VALUES($1,$2)', [venue, f.other]);
    check(
      (
        await rpc('ticketing_set_status', [
          f.event,
          f.other,
          JSON.stringify({ ticketing_status: 'sales_paused' }),
        ])
      ).code === 'financial_organizer_required',
      'venue staff cannot become financial organizer',
    );
    check(
      (await rpc('ticketing_patch_tier', [f.event, f.tier, JSON.stringify({ capacity: 0 })]))
        .code === 'capacity_below_committed',
      'tier capacity cannot undercut active holds',
    );
    const grants = await query(
      "SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'ticketing_%' AND (has_function_privilege('anon',oid,'EXECUTE') OR has_function_privilege('authenticated',oid,'EXECUTE'))",
    );
    check(
      grants.rows.length === 0,
      'all ticketing RPCs deny anonymous and authenticated direct execution',
    );
    check(
      !(await query("SELECT has_table_privilege('authenticated','ticket_orders','SELECT') allowed"))
        .rows[0].allowed,
      'buyer role cannot read frozen Stripe request snapshots',
    );
    f = await fixture();
    const pending = await reserve(f);
    check(
      (
        await rpc('ticketing_fulfill_order', [
          pending.order_id,
          'cs_' + pending.order_id,
          'pi_' + pending.order_id,
          'ch',
          999,
          'usd',
          '[]',
        ])
      ).code === 'amount_mismatch',
      'financial mismatch cannot issue tickets',
    );
    const contenders = await Promise.all([mint(f, pending.order_id), reserve(f, f.other)]);
    check(
      contenders[0].ok && contenders[1].code === 'insufficient_inventory',
      'hold-to-ticket conversion cannot disappear between inventory counts',
    );
    await rpc('ticketing_patch_tier', [f.event, f.tier, JSON.stringify({ unit_amount: 2500 })]);
    check(
      (
        await query('SELECT unit_amount FROM ticket_order_items WHERE order_id=$1', [
          pending.order_id,
        ])
      ).rows[0].unit_amount === 1000,
      'tier edits preserve historical purchase prices',
    );
    check(
      (
        await rpc('ticketing_set_status', [
          f.event,
          f.host,
          JSON.stringify({ ticketing_status: 'sales_closed' }),
        ])
      ).ok,
      'financial organizer can close sales',
    );
    check(
      (
        await rpc('ticketing_set_status', [
          f.event,
          f.host,
          JSON.stringify({ ticketing_status: 'sales_open' }),
        ])
      ).code === 'invalid_transition',
      'closed sales cannot reopen',
    );
    const free = randomUUID();
    await query('INSERT INTO map_beacons(id,creator_id) VALUES($1,$2)', [free, f.host]);
    await query("INSERT INTO beacon_attendees VALUES($1,$2,'web')", [free, f.buyer]);
    check(
      (
        await rpc('ticketing_set_status', [
          free,
          f.host,
          JSON.stringify({ ticketing_status: 'draft' }),
        ])
      ).code === 'existing_free_attendees',
      'existing free admission cannot silently become paid',
    );
    await query('DELETE FROM beacon_attendees WHERE beacon_id=$1', [free]);
    check(true, 'free RSVP insert and delete remain functional');
    console.log('Completed ' + assertions + ' PostgreSQL assertions with independent connections.');
  } catch (error) {
    console.error('Test failure:', error);
    throw error;
  } finally {
    if (pool) await pool.end();
    if (process.env.TICKETING_TEST_KEEP_DATABASE === 'true')
      console.log('Retained test database: ' + database);
    else {
      await control.query('SET statement_timeout=5000');
      await control.query(`DROP DATABASE IF EXISTS ${database}`).catch((error) => {
        console.warn(`Cleanup of temporary database ${database} failed: ${error.message}`);
      });
    }
    await control.end();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
