/**
 * @jest-environment node
 */

import {
  CONNECTION_FLOW_ALLOWED_EVENTS,
  emitConnectionFlowEvent,
  proximityAtEventSkipReason,
  sanitizeCaptureQuality,
} from '@/lib/server/telemetry/connectionFlowEvents';

describe('connectionFlowEvents', () => {
  it('allowlists at-event attached and skipped', () => {
    expect(CONNECTION_FLOW_ALLOWED_EVENTS.has('proximity_at_event_attached')).toBe(true);
    expect(CONNECTION_FLOW_ALLOWED_EVENTS.has('proximity_at_event_skipped')).toBe(true);
  });

  it('classifies skip reasons without GPS or enough participants', () => {
    expect(proximityAtEventSkipReason(null, null, ['a', 'b'])).toBe('missing_gps');
    expect(proximityAtEventSkipReason(0, 0, ['a', 'b'])).toBe('missing_gps');
    expect(proximityAtEventSkipReason(47.6, -122.3, [])).toBe('insufficient_participants');
    expect(proximityAtEventSkipReason(47.6, -122.3, ['a'])).toBe('no_live_event_match');
    expect(proximityAtEventSkipReason(47.6, -122.3, ['a', 'b'])).toBe('no_live_event_match');
  });

  it('rejects unknown event types and inserts allowlisted ones', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const admin = {
      from: jest.fn().mockReturnValue({ insert }),
    };

    await expect(
      emitConnectionFlowEvent(admin as never, { event: 'not_a_real_event' }),
    ).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();

    await expect(
      emitConnectionFlowEvent(admin as never, {
        event: 'proximity_at_event_skipped',
        reason: 'missing_gps',
        peerCount: 2,
      }),
    ).resolves.toBe(true);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'proximity_at_event_skipped',
        reason: 'missing_gps',
        peer_count: 2,
      }),
    );
  });

  it('keeps only allowlisted aggregate capture-quality metrics', () => {
    expect(
      sanitizeCaptureQuality({
        location_accuracy_m: 4.837,
        location_accuracy_bucket: 'excellent',
        location_full_accuracy: true,
        ble_rssi_median_dbm: -56,
        ultrasonic_snr_db: 17.2,
        latitude: 47.61,
        token: '1234',
        user_id: 'abc',
        sensor_failure: 'something else',
        motion_sample_count: -3,
      }),
    ).toEqual({
      location_accuracy_m: 4.84,
      location_accuracy_bucket: 'excellent',
      location_full_accuracy: true,
      ble_rssi_median_dbm: -56,
      ultrasonic_snr_db: 17.2,
    });
    expect(sanitizeCaptureQuality({ latitude: 1 })).toBeNull();
    expect(sanitizeCaptureQuality('x')).toBeNull();
  });

  it('stores capture quality only when present', async () => {
    const insert = jest.fn().mockResolvedValue({ error: null });
    const admin = { from: jest.fn().mockReturnValue({ insert }) };
    await emitConnectionFlowEvent(admin as never, { event: 'proximity_handshake_matched' });
    expect(insert.mock.calls[0][0]).not.toHaveProperty('capture_quality');
    await emitConnectionFlowEvent(admin as never, {
      event: 'proximity_handshake_matched',
      captureQuality: { location_accuracy_m: 5 },
    });
    expect(insert.mock.calls[1][0]).toMatchObject({ capture_quality: { location_accuracy_m: 5 } });
  });
});
