-- One-off backfill of the 2026-10-05 iPhone → web QR encounter recorded before the full
-- weather / terrain enrichment shipped. Values: Open-Meteo 15-minute record for 15:15 UTC and
-- DEM elevation at the encounter's coordinate; barometer values from the row's own
-- sensor_observation. No-op on any database without this row.
--
-- The barometer/terrain columns come from encounter_observation_quality, which production
-- applied as 20261002153040 but which is filed here as 20261012000000, so a clean replay
-- reaches this migration before those columns exist (and without this row). Skip then.
do $$
begin
  if (
    select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'connection_encounters'
      and column_name in ('terrain_elevation_m', 'barometric_pressure_kpa', 'barometric_relative_altitude_m')
  ) < 3 then
    return;
  end if;

  update public.connection_encounters
  set weather_snapshot = to_jsonb('{"iconCode":"cloudy","condition":"Cloudy","windSpeedKph":1.8,"pressureMslHpa":1019.6,"temperatureCelsius":10.8,"windDirectionDegrees":21}'::text),
      terrain_elevation_m = coalesce(terrain_elevation_m, 17.0),
      barometric_pressure_kpa = coalesce(barometric_pressure_kpa, 101.788),
      barometric_relative_altitude_m = coalesce(barometric_relative_altitude_m, 0)
  where id = 'd794b9f0-f173-468f-b776-6499b8ca35a5';
end $$;
