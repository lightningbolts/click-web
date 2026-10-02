"use client";
import { useEffect, useRef, useState } from "react";
import { FcButton, FcField, FcInput } from "@/components/fc";
import { ticketingApi } from "@/lib/ticketing/api";
import { ticketingError } from "@/lib/ticketing/errors";
type Detector = { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type Scan = { result: string; attendee_name?: string; tier_name?: string; ticket_number?: string };
export default function TicketCheckInScanner({ beaconId }: { beaconId: string }) {
  const [credential, setCredential] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Scan | null>(null),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    active = useRef(false),
    scanning = useRef(false);
  function stop() {
    active.current = false;
    if (timer.current) clearTimeout(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }
  useEffect(
    () => () => {
      active.current = false;
      if (timer.current) clearTimeout(timer.current);
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  async function scan(value: string) {
    if (scanning.current) return;
    scanning.current = true;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const d = await ticketingApi<Scan>("/api/beacons/" + beaconId + "/tickets/check-in", {
        credential: value.trim(),
      });
      setResult(d);
      setCredential("");
    } catch (e) {
      setError(ticketingError(e));
    } finally {
      setBusy(false);
      scanning.current = false;
    }
  }
  async function camera() {
    setError("");
    const Barcode = (
      window as unknown as { BarcodeDetector?: new (options: { formats: string[] }) => Detector }
    ).BarcodeDetector;
    if (!Barcode || !navigator.mediaDevices) {
      setError("Camera scanning is unavailable in this browser. Use the manual credential field.");
      return;
    }
    try {
      stop();
      active.current = true;
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (!active.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (!video.current) return;
      video.current.srcObject = media;
      await video.current.play();
      const detector = new Barcode({ formats: ["qr_code"] });
      const read = async () => {
        if (!active.current || !video.current) return;
        try {
          const codes = await detector.detect(video.current);
          if (codes[0]) {
            stop();
            await scan(codes[0].rawValue);
            return;
          }
          timer.current = setTimeout(read, 300);
        } catch {
          stop();
          setError("Camera could not read the QR. Use manual entry.");
        }
      };
      void read();
    } catch {
      stop();
      setError("Camera access was unavailable. Use manual entry.");
    }
  }
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold">Ticket check-in</h1>
      <p>Each scan checks your current event staff access.</p>
      <video ref={video} muted playsInline className="max-h-80 w-full" />
      <div className="flex gap-2">
        <FcButton disabled={busy} onClick={camera}>
          Start camera
        </FcButton>
        <FcButton variant="secondary" onClick={stop}>
          Stop camera
        </FcButton>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void scan(credential);
        }}
      >
        <FcField label="Manual QR URL or token">
          <FcInput
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            required
            minLength={16}
            autoComplete="off"
          />
        </FcField>
        <FcButton type="submit" disabled={busy}>
          {busy ? "Checking…" : "Check ticket"}
        </FcButton>
      </form>
      <div role="status" aria-live="polite">
        {result ? (
          <>
            <strong>{result.result.replaceAll("_", " ")}</strong>
            {!["invalid", "wrong_event"].includes(result.result) ? (
              <p>
                {result.attendee_name} · {result.tier_name} · {result.ticket_number}
              </p>
            ) : null}
          </>
        ) : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}
