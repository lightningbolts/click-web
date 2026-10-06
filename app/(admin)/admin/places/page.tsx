import Link from 'next/link';

import {
  addPlaceManagerAction,
  backfillEncountersAction,
  createAnchorAction,
  createPlaceAction,
  deactivateAnchorAction,
  removePlaceManagerAction,
  rotateAnchorAction,
  setHubEnabledAction,
  setPlaceListedAction,
  setVerificationAction,
  updatePlaceAction,
} from '@/app/(admin)/admin/places/actions';
import { categoryLabel, PLACE_CATEGORIES } from '@/lib/places/categories';
import { createAdminSupabaseClient } from '@/lib/server/admin/supabaseAdmin';
import { PLACE_COLUMNS, type PlaceRow } from '@/lib/server/places/loadPlace';

export const dynamic = 'force-dynamic';

/** Render-time clock (dynamic route: evaluated per request). */
function requestTimeMs(): number {
  return Date.now();
}

type SearchParamsShape = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

const STATUSES = ['all', 'draft', 'pending', 'verified', 'suspended'] as const;
const inputClass = 'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-fg';
const buttonClass = 'rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-fg hover:bg-zinc-700';

function countBy(rows: Array<Record<string, unknown>>, key: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const id = row[key];
    if (typeof id === 'string') out.set(id, (out.get(id) ?? 0) + 1);
  }
  return out;
}

function Field({ label, name, defaultValue, type = 'text', step, required }: { label: string; name: string; defaultValue?: string | number | null; type?: string; step?: string; required?: boolean }) {
  return (
    <label className="block space-y-1 text-xs text-zinc-400">
      <span>{label}</span>
      <input className={inputClass} name={name} type={type} step={step} required={required} defaultValue={defaultValue ?? ''} />
    </label>
  );
}

function CategorySelect({ defaultValue }: { defaultValue?: string | null }) {
  return (
    <label className="block space-y-1 text-xs text-zinc-400">
      <span>Category</span>
      <select className={inputClass} name="category" defaultValue={defaultValue ?? 'cafe'}>
        {PLACE_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {categoryLabel(c)}
          </option>
        ))}
      </select>
    </label>
  );
}

/** /admin/places — create, verify, list and operate Click Places (§7.4, §5.10). */
export default async function AdminPlacesPage({ searchParams }: { searchParams?: Promise<SearchParamsShape> }) {
  const params = (await searchParams) ?? {};
  const notice = single(params.notice);
  const error = single(params.error);
  const statusFilter = (single(params.status) ?? 'all') as (typeof STATUSES)[number];
  const selectedId = single(params.place);

  const admin = createAdminSupabaseClient();
  const sinceIso = new Date(requestTimeMs() - 30 * 86_400_000).toISOString();
  const [placesRes, managersRes, anchorsRes, checkInsRes] = await Promise.all([
    admin.from('places').select(PLACE_COLUMNS).order('name', { ascending: true }).limit(500),
    admin.from('place_managers').select('id, place_id, user_id, role'),
    admin.from('nfc_anchors').select('id, venue_id, name, qr_token, active, purpose, rotated_at').eq('purpose', 'check_in'),
    admin.from('place_check_ins').select('place_id').gte('checked_at', sinceIso).limit(50000),
  ]);
  const places = ((placesRes.data ?? []) as PlaceRow[]).filter((p) => statusFilter === 'all' || p.verification_status === statusFilter);
  const managers = (managersRes.data ?? []) as Array<{ id: string; place_id: string; user_id: string; role: string }>;
  const anchors = (anchorsRes.data ?? []) as Array<{ id: string; venue_id: string; name: string | null; qr_token: string; active: boolean; rotated_at: string | null }>;
  const managerCount = countBy(managers, 'place_id');
  const activeAnchorCount = countBy(anchors.filter((a) => a.active), 'venue_id');
  const checkInCount = countBy((checkInsRes.data ?? []) as Array<Record<string, unknown>>, 'place_id');
  const selected = ((placesRes.data ?? []) as PlaceRow[]).find((p) => p.id === selectedId) ?? null;

  let managerEmails = new Map<string, string>();
  if (selected) {
    const ids = managers.filter((m) => m.place_id === selected.id).map((m) => m.user_id);
    if (ids.length > 0) {
      const { data } = await admin.from('users').select('id, email').in('id', ids);
      managerEmails = new Map(((data ?? []) as Array<{ id: string; email: string | null }>).map((u) => [u.id, u.email ?? u.id]));
    }
  }

  return (
    <div className="space-y-8 pb-10">
      {notice ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{notice}</div> : null}
      {error ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div> : null}
      {placesRes.error ? <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">places unavailable: {placesRes.error.message}</div> : null}

      <header>
        <h2 className="text-2xl font-semibold text-white">Click Places</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Pilot Places are created and verified here. Never add homes, clinics, places of worship, support groups, shelters, K–12 schools or public land.
        </p>
      </header>

      <section className="glass-panel space-y-4 rounded-2xl p-5">
        <div className="flex flex-wrap gap-2 text-xs">
          {STATUSES.map((s) => (
            <Link key={s} href={`/admin/places?status=${s}`} className={`rounded-full border px-3 py-1 ${s === statusFilter ? 'border-violet-400 text-white' : 'border-zinc-700 text-zinc-400'}`}>
              {s}
            </Link>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-zinc-400">
              <tr>
                {['Name', 'Slug', 'Category', 'Status', 'Listed', 'Hub', 'Managers', 'Active codes', 'Check-ins 30 d'].map((h) => (
                  <th key={h} className="px-2 py-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {places.map((p) => (
                <tr key={p.id} className="border-t border-zinc-800">
                  <td className="px-2 py-2">
                    <Link href={`/admin/places?place=${p.id}&status=${statusFilter}`} className="font-semibold text-violet-300 hover:underline">{p.name}</Link>
                  </td>
                  <td className="px-2 py-2 text-zinc-400">{p.slug ?? '—'}</td>
                  <td className="px-2 py-2">{p.category ? categoryLabel(p.category) : '—'}</td>
                  <td className="px-2 py-2">{p.verification_status}</td>
                  <td className="px-2 py-2">{p.listed ? 'yes' : 'no'}</td>
                  <td className="px-2 py-2">{p.hub_enabled ? 'on' : 'off'}</td>
                  <td className="px-2 py-2">{managerCount.get(p.id) ?? 0}</td>
                  <td className="px-2 py-2">{activeAnchorCount.get(p.id) ?? 0}</td>
                  <td className="px-2 py-2">{checkInCount.get(p.id) ?? 0}</td>
                </tr>
              ))}
              {places.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-4 text-zinc-400">No Places.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected ? (
        <section className="glass-panel space-y-6 rounded-2xl p-5" id="place-detail">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xl font-semibold text-white">{selected.name}</h3>
            {selected.latitude != null && selected.longitude != null ? (
              <a className="text-xs text-violet-300 hover:underline" href={`https://maps.apple.com/?ll=${selected.latitude},${selected.longitude}&q=${encodeURIComponent(selected.name)}`} target="_blank" rel="noreferrer">
                Check the pin in Apple Maps
              </a>
            ) : null}
          </header>

          <div className="flex flex-wrap gap-2">
            <form action={setVerificationAction}>
              <input type="hidden" name="place_id" value={selected.id} />
              <input type="hidden" name="status" value={selected.verification_status === 'verified' ? 'suspended' : 'verified'} />
              <button className={buttonClass}>{selected.verification_status === 'verified' ? 'Suspend' : 'Verify'}</button>
            </form>
            <form action={setPlaceListedAction}>
              <input type="hidden" name="place_id" value={selected.id} />
              <input type="hidden" name="listed" value={selected.listed ? 'false' : 'true'} />
              <button className={buttonClass}>{selected.listed ? 'Unlist' : 'List'}</button>
            </form>
            <form action={setHubEnabledAction}>
              <input type="hidden" name="place_id" value={selected.id} />
              <input type="hidden" name="hub_enabled" value={selected.hub_enabled ? 'false' : 'true'} />
              <button className={buttonClass}>{selected.hub_enabled ? 'Turn hub off' : 'Enable hub'}</button>
            </form>
            <form action={backfillEncountersAction}>
              <input type="hidden" name="place_id" value={selected.id} />
              <button className={buttonClass}>Backfill encounters</button>
            </form>
          </div>

          <form action={updatePlaceAction} className="grid gap-3 md:grid-cols-3">
            <input type="hidden" name="place_id" value={selected.id} />
            <Field label="Name" name="name" defaultValue={selected.name} />
            <Field label="Slug" name="slug" defaultValue={selected.slug} />
            <CategorySelect defaultValue={selected.category} />
            <Field label="Latitude" name="latitude" type="number" step="any" defaultValue={selected.latitude} />
            <Field label="Longitude" name="longitude" type="number" step="any" defaultValue={selected.longitude} />
            <Field label="Radius (25–750 m)" name="radius_meters" type="number" defaultValue={selected.radius_meters} />
            <Field label="Timezone" name="timezone" defaultValue={selected.timezone} />
            <Field label="Street address" name="address_line" defaultValue={selected.address_line} />
            <Field label="City" name="city" defaultValue={selected.city} />
            <Field label="Region" name="region" defaultValue={selected.region} />
            <Field label="Postal code" name="postal_code" defaultValue={selected.postal_code} />
            <Field label="Website (https)" name="website_url" defaultValue={selected.website_url} />
            <div className="md:col-span-3">
              <button className={buttonClass}>Save profile</button>
              <span className="ml-3 text-xs text-zinc-400">Moving the pin or radius re-attributes encounters and moves the Place Hub geofence.</span>
            </div>
          </form>

          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white">Managers</h4>
              <ul className="space-y-2 text-sm">
                {managers.filter((m) => m.place_id === selected.id).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span>{managerEmails.get(m.user_id) ?? m.user_id} · {m.role}</span>
                    <form action={removePlaceManagerAction}>
                      <input type="hidden" name="place_id" value={selected.id} />
                      <input type="hidden" name="manager_id" value={m.id} />
                      <button className={buttonClass}>Remove</button>
                    </form>
                  </li>
                ))}
              </ul>
              <form action={addPlaceManagerAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="place_id" value={selected.id} />
                <div className="min-w-[12rem] flex-1"><Field label="Email" name="email" type="email" required /></div>
                <select name="role" className={`${inputClass} w-auto`} defaultValue="manager">
                  <option value="owner">owner</option>
                  <option value="manager">manager</option>
                  <option value="viewer">viewer</option>
                </select>
                <button className={buttonClass}>Add</button>
              </form>
            </div>

            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-white">Check-in QR codes</h4>
              <ul className="space-y-2 text-sm">
                {anchors.filter((a) => a.venue_id === selected.id).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{a.name ?? 'Code'} · {a.active ? 'active' : 'inactive'}{a.rotated_at ? ' · rotated' : ''}</span>
                    {a.active ? (
                      <span className="flex gap-2">
                        <form action={rotateAnchorAction}>
                          <input type="hidden" name="place_id" value={selected.id} />
                          <input type="hidden" name="anchor_id" value={a.id} />
                          <button className={buttonClass}>Rotate</button>
                        </form>
                        <form action={deactivateAnchorAction}>
                          <input type="hidden" name="place_id" value={selected.id} />
                          <input type="hidden" name="anchor_id" value={a.id} />
                          <button className={buttonClass}>Deactivate</button>
                        </form>
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <form action={createAnchorAction} className="flex items-end gap-2">
                <input type="hidden" name="place_id" value={selected.id} />
                <div className="flex-1"><Field label="Code name" name="name" defaultValue="Counter" /></div>
                <button className={buttonClass}>Create code</button>
              </form>
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-panel space-y-4 rounded-2xl p-5">
        <h3 className="text-lg font-semibold text-white">Create a Place</h3>
        <p className="text-xs text-zinc-400">New Places are verified and unlisted. List them after adding managers and a check-in code.</p>
        <form action={createPlaceAction} className="grid gap-3 md:grid-cols-3">
          <Field label="Name" name="name" required />
          <CategorySelect />
          <Field label="Radius (25–750 m)" name="radius_meters" type="number" defaultValue={75} />
          <Field label="Latitude" name="latitude" type="number" step="any" required />
          <Field label="Longitude" name="longitude" type="number" step="any" required />
          <Field label="Timezone" name="timezone" defaultValue="America/Los_Angeles" />
          <Field label="Street address" name="address_line" />
          <Field label="City" name="city" />
          <Field label="Region" name="region" />
          <Field label="Postal code" name="postal_code" />
          <Field label="Country (2 letters)" name="country_code" defaultValue="US" />
          <Field label="Website (https)" name="website_url" />
          <div className="md:col-span-3">
            <button className={buttonClass}>Create Place</button>
          </div>
        </form>
      </section>
    </div>
  );
}
