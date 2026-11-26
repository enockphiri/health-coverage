-- For every settlement: nearest facility (optionally of one type),
-- distance in metres (UTM 36S), and covered / underserved for the radius.
SELECT s.id,
       s.name,
       s.population,
       ST_X(s.geom) AS lng,
       ST_Y(s.geom) AS lat,
       nf.name          AS facility_name,
       nf.facility_type AS facility_type,
       ROUND(nf.dist::numeric) AS distance_m,
       (nf.dist <= %(radius_m)s) AS covered
FROM settlements s
CROSS JOIN LATERAL (
    SELECT f.name, f.facility_type,
           ST_Distance(s.geom_utm, f.geom_utm) AS dist
    FROM facilities f
    WHERE (%(ftype)s = 'all' OR f.facility_type = %(ftype)s)
    ORDER BY s.geom_utm <-> f.geom_utm
    LIMIT 1
) nf
ORDER BY nf.dist DESC;