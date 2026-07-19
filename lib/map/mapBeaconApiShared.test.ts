import { parseLatLngFromLocationField } from "./mapBeaconApiShared";

describe("parseLatLngFromLocationField", () => {
  it("parses WKT POINT", () => {
    expect(parseLatLngFromLocationField("POINT(-122.3321 47.6062)", Number.NaN, Number.NaN)).toEqual({
      lat: 47.6062,
      lng: -122.3321,
    });
  });

  it("parses EWKB Point with SRID 4326 (PostgREST geography)", () => {
    // POINT(-122.3321 47.6062), SRID 4326, little-endian
    const lng = -122.3321;
    const lat = 47.6062;
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0); // little endian
    buf.writeUInt32LE(0x20000001, 1); // Point | has SRID
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(lng, 9);
    buf.writeDoubleLE(lat, 17);
    const hex = buf.toString("hex");
    expect(parseLatLngFromLocationField(hex, Number.NaN, Number.NaN)).toEqual({ lat, lng });
  });

  it("parses GeoJSON Point object", () => {
    expect(
      parseLatLngFromLocationField(
        { type: "Point", coordinates: [-122.3321, 47.6062] },
        Number.NaN,
        Number.NaN,
      ),
    ).toEqual({ lat: 47.6062, lng: -122.3321 });
  });

  it("does not invent null-island when parse fails", () => {
    const result = parseLatLngFromLocationField("not-a-point", Number.NaN, Number.NaN);
    expect(Number.isFinite(result.lat)).toBe(false);
    expect(Number.isFinite(result.lng)).toBe(false);
  });
});
