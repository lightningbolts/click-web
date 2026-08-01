-- Recompute elevation_category from relative_altitude_m (AGL) where DEM enrich already ran.
-- Thresholds mirror deriveHeightCategory / deriveHeightCategoryFromRelativeAltitudeM:
--   < -3 BELOW_GROUND | < 8 GROUND_LEVEL | < 35 ELEVATED | else HIGH_RISE

UPDATE public.connection_encounters
SET elevation_category = CASE
  WHEN relative_altitude_m < -3.0 THEN 'BELOW_GROUND'
  WHEN relative_altitude_m < 8.0 THEN 'GROUND_LEVEL'
  WHEN relative_altitude_m < 35.0 THEN 'ELEVATED'
  ELSE 'HIGH_RISE'
END
WHERE relative_altitude_m IS NOT NULL
  AND (
    elevation_category IS DISTINCT FROM CASE
      WHEN relative_altitude_m < -3.0 THEN 'BELOW_GROUND'
      WHEN relative_altitude_m < 8.0 THEN 'GROUND_LEVEL'
      WHEN relative_altitude_m < 35.0 THEN 'ELEVATED'
      ELSE 'HIGH_RISE'
    END
  );

COMMENT ON COLUMN public.connection_encounters.elevation_category IS
  'Height above local ground band derived from relative_altitude_m (AGL), not barometric AMSL.';
