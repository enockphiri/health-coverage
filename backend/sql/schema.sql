-- backend/sql/schema.sql
-- Schema for the Health Facility Accessibility and Coverage system.
-- Geometries are stored in WGS84 (EPSG:4326) for Leaflet. A generated column
-- holds the same geometry in UTM zone 36S (EPSG:32736, units = metres) so
-- distance analysis such as ST_DWithin(..., 3000) really means 3 km.
-- Pattern for generated columns: PostgreSQL docs, "Generated Columns".

CREATE EXTENSION IF NOT EXISTS postgis;

-- Lilongwe District boundary
CREATE TABLE IF NOT EXISTS district_boundary (
    id        SERIAL PRIMARY KEY,
    name      VARCHAR(100) NOT NULL,
    geom      geometry(MultiPolygon, 4326) NOT NULL
);

-- Health facilities (hospitals, health centres, dispensaries, ...)
CREATE TABLE IF NOT EXISTS facilities (
    id             SERIAL PRIMARY KEY,
    name           VARCHAR(200) NOT NULL,
    facility_type  VARCHAR(100),
    geom           geometry(Point, 4326) NOT NULL,
    geom_utm       geometry(Point, 32736)
                   GENERATED ALWAYS AS (ST_Transform(geom, 32736)) STORED
);

-- Settlements (villages / places), stored as points
CREATE TABLE IF NOT EXISTS settlements (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(200),
    population  INTEGER,
    geom        geometry(Point, 4326) NOT NULL,
    geom_utm    geometry(Point, 32736)
                GENERATED ALWAYS AS (ST_Transform(geom, 32736)) STORED
);

-- Spatial indexes (make ST_DWithin and map queries fast)
CREATE INDEX IF NOT EXISTS idx_boundary_geom    ON district_boundary USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_facilities_geom  ON facilities USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_facilities_utm   ON facilities USING GIST (geom_utm);
CREATE INDEX IF NOT EXISTS idx_settlements_geom ON settlements USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_settlements_utm  ON settlements USING GIST (geom_utm);