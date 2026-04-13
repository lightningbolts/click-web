import {
  approveVenueAction,
  banDeviceAction,
  rejectVenueAction,
  severConnectionAction,
  suspendUserAction,
} from '@/app/(admin)/admin/actions';
import { getAdminDashboardData, type VenueTier } from '@/lib/server/admin/dashboardData';

type SearchParamsShape = Record<string, string | string[] | undefined>;

type AdminPageProps = {
  searchParams?: SearchParamsShape | Promise<SearchParamsShape>;
};

function readSingleParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function toIsoDateTime(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toLocaleString();
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const num = Number(value);
    if (Number.isFinite(num)) return new Date(num).toLocaleString();
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return new Date(parsed).toLocaleString();
    return value;
  }
  return 'Unknown';
}

function tierBadgeClasses(tier: VenueTier): string {
  if (tier === 'Enterprise') return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30';
  if (tier === 'Nexus') return 'bg-sky-500/20 text-sky-300 border-sky-400/30';
  if (tier === 'Pulse') return 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30';
  return 'bg-zinc-700/40 text-zinc-200 border-zinc-600/40';
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedParams = (await searchParams) ?? {};
  const notice = readSingleParam(resolvedParams.notice);
  const error = readSingleParam(resolvedParams.error);

  const data = await getAdminDashboardData();

  return (
    <div className="space-y-8 pb-10">
      {notice ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {data.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Data source warnings</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <section id="trust-safety" className="space-y-5">
        <header>
          <h2 className="text-2xl font-semibold text-white">Trust &amp; Safety Hub</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Metadata-only moderation, consent-forwarded message review, and physical graph anomaly triage.
          </p>
        </header>

        <div className="grid gap-4 xl:grid-cols-3">
          <form action={suspendUserAction} className="glass-panel space-y-3 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white">Global User Suspension</h3>
            <input
              name="user_id"
              required
              placeholder="User UUID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <input
              name="duration_hours"
              type="number"
              min={1}
              max={43800}
              defaultValue={720}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <button className="w-full rounded-lg bg-rose-500 px-3 py-2 text-sm font-semibold text-white hover:bg-rose-400">
              Suspend User
            </button>
          </form>

          <form action={banDeviceAction} className="glass-panel space-y-3 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white">Ban Device (Push Token)</h3>
            <input
              name="push_token"
              required
              placeholder="Expo/APNs/FCM token"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <button className="w-full rounded-lg bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-white">
              Revoke Device Token
            </button>
          </form>

          <form action={severConnectionAction} className="glass-panel space-y-3 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-white">Sever Toxic Connection</h3>
            <input
              name="actor_user_id"
              required
              placeholder="Actor user UUID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <input
              name="target_user_id"
              required
              placeholder="Target user UUID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <input
              name="connection_id"
              required
              placeholder="Connection UUID"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none focus:border-zinc-500"
            />
            <button className="w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-400">
              Block Both + Hide Connection
            </button>
          </form>
        </div>

        <div className="glass-panel overflow-x-auto rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Connection Reports</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-2 py-2">Reported User</th>
                <th className="px-2 py-2">Reporter</th>
                <th className="px-2 py-2">Reason</th>
                <th className="px-2 py-2">Timestamp</th>
                <th className="px-2 py-2">Fast Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {data.moderation.reports.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-zinc-400" colSpan={5}>
                    No reports available.
                  </td>
                </tr>
              ) : (
                data.moderation.reports.map((report) => (
                  <tr key={report.id}>
                    <td className="px-2 py-3">{report.reportedLabel}</td>
                    <td className="px-2 py-3">{report.reporterLabel}</td>
                    <td className="px-2 py-3">{report.reason}</td>
                    <td className="px-2 py-3 text-zinc-400">{toIsoDateTime(report.createdAt)}</td>
                    <td className="px-2 py-3">
                      {report.reportedId !== 'unknown' ? (
                        <form action={severConnectionAction}>
                          <input type="hidden" name="actor_user_id" value={report.reporterId} />
                          <input type="hidden" name="target_user_id" value={report.reportedId} />
                          <input type="hidden" name="connection_id" value={report.connectionId} />
                          <button className="rounded-md border border-amber-500/40 px-2 py-1 text-xs text-amber-300 hover:bg-amber-500/10">
                            Sever
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-zinc-500">N/A</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel overflow-x-auto rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Decrypted Message Inbox (Consent-Forwarded)</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-2 py-2">Sender</th>
                <th className="px-2 py-2">Connection</th>
                <th className="px-2 py-2">Type</th>
                <th className="px-2 py-2">Content</th>
                <th className="px-2 py-2">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {data.moderation.forwardedMessages.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-zinc-400" colSpan={5}>
                    No consent-forwarded messages found.
                  </td>
                </tr>
              ) : (
                data.moderation.forwardedMessages.map((message) => (
                  <tr key={message.id}>
                    <td className="px-2 py-3">{message.senderLabel}</td>
                    <td className="px-2 py-3 text-zinc-400">{message.connectionId ?? 'N/A'}</td>
                    <td className="px-2 py-3">{message.messageType}</td>
                    <td className="max-w-[540px] truncate px-2 py-3" title={message.content}>
                      {message.content}
                    </td>
                    <td className="px-2 py-3 text-zinc-400">{toIsoDateTime(message.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Physical Graph Anomalies (Last 7 Days)</h3>
          {data.moderation.graphAnomalies.length === 0 ? (
            <p className="text-sm text-zinc-400">No abnormal high-degree connection nodes detected.</p>
          ) : (
            <ul className="space-y-2 text-sm text-zinc-200">
              {data.moderation.graphAnomalies.map((anomaly) => (
                <li key={anomaly.userId} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2">
                  <span>{anomaly.userLabel}</span>
                  <span className="text-zinc-400">{anomaly.recentConnectionDegree} new edges</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section id="click-insights" className="space-y-5">
        <header>
          <h2 className="text-2xl font-semibold text-white">Click Insights (B2B) Management</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Subscription tiers, venue verification workflow, and pop-up beacon saturation control.
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(['Spark', 'Pulse', 'Nexus', 'Enterprise'] as VenueTier[]).map((tier) => (
            <div key={tier} className="glass-panel rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-zinc-400">{tier}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{data.insights.activeTierCounts[tier]}</p>
              <p className="text-xs text-zinc-500">Active/trialing subscriptions</p>
            </div>
          ))}
        </div>

        <div className="glass-panel overflow-x-auto rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Tier Management</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-2 py-2">Venue</th>
                <th className="px-2 py-2">Tier</th>
                <th className="px-2 py-2">Subscription Status</th>
                <th className="px-2 py-2">Managers</th>
                <th className="px-2 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {data.insights.subscriptions.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-zinc-400" colSpan={5}>
                    No venue subscriptions found.
                  </td>
                </tr>
              ) : (
                data.insights.subscriptions.map((venue) => (
                  <tr key={venue.id}>
                    <td className="px-2 py-3">
                      <p>{venue.name}</p>
                      <p className="text-xs text-zinc-500">{venue.location ?? 'Location unknown'}</p>
                    </td>
                    <td className="px-2 py-3">
                      <span className={`rounded-full border px-2 py-1 text-xs ${tierBadgeClasses(venue.inferredTier)}`}>
                        {venue.inferredTier}
                      </span>
                    </td>
                    <td className="px-2 py-3">{venue.subscriptionStatus}</td>
                    <td className="px-2 py-3">{venue.managerCount}</td>
                    <td className="px-2 py-3 text-zinc-400">{toIsoDateTime(venue.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel overflow-x-auto rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Venue Verification Queue</h3>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-400">
              <tr>
                <th className="px-2 py-2">Venue</th>
                <th className="px-2 py-2">Current Status</th>
                <th className="px-2 py-2">Owners/Managers</th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800 text-zinc-200">
              {data.insights.verificationQueue.length === 0 ? (
                <tr>
                  <td className="px-2 py-4 text-zinc-400" colSpan={5}>
                    No pending venues in verification queue.
                  </td>
                </tr>
              ) : (
                data.insights.verificationQueue.map((queueItem) => (
                  <tr key={queueItem.venueId}>
                    <td className="px-2 py-3">{queueItem.venueName}</td>
                    <td className="px-2 py-3">{queueItem.subscriptionStatus}</td>
                    <td className="px-2 py-3">{queueItem.ownerCount}</td>
                    <td className="px-2 py-3 text-zinc-400">{toIsoDateTime(queueItem.createdAt)}</td>
                    <td className="px-2 py-3">
                      <div className="flex gap-2">
                        <form action={approveVenueAction}>
                          <input type="hidden" name="venue_id" value={queueItem.venueId} />
                          <button className="rounded-md border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10">
                            Approve
                          </button>
                        </form>
                        <form action={rejectVenueAction}>
                          <input type="hidden" name="venue_id" value={queueItem.venueId} />
                          <button className="rounded-md border border-rose-500/40 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10">
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="glass-panel rounded-2xl p-4">
          <h3 className="mb-3 text-sm font-semibold text-white">Pop-Up Beacon Map (Active)</h3>
          {data.insights.activeBeacons.length === 0 ? (
            <p className="text-sm text-zinc-400">No active pop-up beacons.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-400">
                  <tr>
                    <th className="px-2 py-2">Venue</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2">Perk</th>
                    <th className="px-2 py-2">Coordinates</th>
                    <th className="px-2 py-2">Window</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-200">
                  {data.insights.activeBeacons.map((beacon) => (
                    <tr key={beacon.id}>
                      <td className="px-2 py-3">{beacon.venueName}</td>
                      <td className="px-2 py-3">{beacon.categoryTarget}</td>
                      <td className="px-2 py-3">{beacon.perkDescription}</td>
                      <td className="px-2 py-3 text-zinc-400">
                        {beacon.latitude == null || beacon.longitude == null
                          ? 'No venue coordinates'
                          : `${beacon.latitude.toFixed(4)}, ${beacon.longitude.toFixed(4)}`}
                      </td>
                      <td className="px-2 py-3 text-zinc-400">
                        {toIsoDateTime(beacon.startsAt)} - {toIsoDateTime(beacon.endsAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section id="system-health" className="space-y-5">
        <header>
          <h2 className="text-2xl font-semibold text-white">System Health &amp; Operations</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Tri-factor handshake diagnostics, crash proxies, and beta waitlist conversion monitoring.
          </p>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Handshake Events (24h)</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {data.operations.encounterDiagnostics.sampledHandshakeEvents24h}
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Handshake Failures (24h)</p>
            <p className="mt-2 text-2xl font-semibold text-rose-300">
              {data.operations.encounterDiagnostics.sampledHandshakeFailures24h}
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Unique-Crash Proxy (24h)</p>
            <p className="mt-2 text-2xl font-semibold text-amber-300">
              {data.operations.encounterDiagnostics.uniqueConstraintCrashProxy24h}
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Encounter Rows Inserted (24h)</p>
            <p className="mt-2 text-2xl font-semibold text-white">
              {data.operations.encounterDiagnostics.encountersInserted24h}
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Estimated Success Rate</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">
              {data.operations.encounterDiagnostics.estimatedSuccessRatePct.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Waitlist Users</p>
            <p className="mt-2 text-3xl font-semibold text-white">{data.operations.waitlistCount}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Active Accounts</p>
            <p className="mt-2 text-3xl font-semibold text-white">{data.operations.activeAccountCount}</p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-400">Activation Ratio</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-300">
              {data.operations.waitlistCount <= 0
                ? 'N/A'
                : `${((data.operations.activeAccountCount / data.operations.waitlistCount) * 100).toFixed(1)}%`}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
