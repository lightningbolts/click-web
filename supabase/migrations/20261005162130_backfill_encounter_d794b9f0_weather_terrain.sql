-- One-off backfill of the 2026-10-05 iPhone → web QR encounter recorded before the full
-- weather / terrain enrichment shipped. Values: Open-Meteo 15-minute record for 15:15 UTC and
-- DEM elevation at the encounter's coordinate; barometer values from the row's own
-- sensor_observation. No-op on any database without this row.
update public.connection_encounters
set weather_snapshot = to_jsonb('{"iconCode":"cloudy","condition":"Cloudy","windSpeedKph":1.8,"pressureMslHpa":1019.6,"temperatureCelsius":10.8,"windDirectionDegrees":21}'::text),
    terrain_elevation_m = coalesce(terrain_elevation_m, 17.0),
    barometric_pressure_kpa = coalesce(barometric_pressure_kpa, 101.788),
    barometric_relative_altitude_m = coalesce(barometric_relative_altitude_m, 0)
where id = 'd794b9f0-f173-468f-b776-6499b8ca35a5';
