import os, json, csv, io
from flask import Blueprint, request, jsonify, Response
from db import get_connection

bp = Blueprint("api", __name__)
SQL_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "sql", "analysis.sql")


def query(sql, params=None):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or {})
            cols = [c[0] for c in cur.description]
            return [dict(zip(cols, r)) for r in cur.fetchall()]
    finally:
        conn.close()


def parse_radius():
    try:
        km = float(request.args.get("radius_km", 3))
    except ValueError:
        return None
    return km if 0 < km <= 100 else None


def build(km, ftype):
    with open(SQL_PATH, encoding="utf-8") as fh:
        sql = fh.read()
    rows = query(sql, {"radius_m": km * 1000, "ftype": ftype})
    feats = []
    for r in rows:
        feats.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [r["lng"], r["lat"]]},
            "properties": {
                "name": r["name"],
                "population": int(r["population"]) if r["population"] is not None else None,
                "distance_m": int(r["distance_m"]),
                "nearest_facility": r["facility_name"],
                "facility_type": r["facility_type"],
                "covered": bool(r["covered"]),
            }})
    cov = [f for f in feats if f["properties"]["covered"]]
    und = [f for f in feats if not f["properties"]["covered"]]
    pop = lambda fs: sum(f["properties"]["population"] or 0 for f in fs)
    unk = lambda fs: sum(1 for f in fs if f["properties"]["population"] is None)
    total = len(feats)
    summary = {
        "radius_km": km, "facility_type": ftype, "total": total,
        "covered": len(cov), "underserved": len(und),
        "pct_covered": round(100 * len(cov) / total, 1) if total else 0,
        "pct_underserved": round(100 * len(und) / total, 1) if total else 0,
        "population_covered": pop(cov), "population_underserved": pop(und),
        "pop_unknown_covered": unk(cov), "pop_unknown_underserved": unk(und),
    }
    return feats, summary


@bp.route("/api/dbtest")
def dbtest():
    return jsonify(query("""SELECT (SELECT COUNT(*) FROM facilities) AS facilities,
        (SELECT COUNT(*) FROM settlements) AS settlements, PostGIS_Version() AS postgis""")[0])


@bp.route("/api/facility_types")
def facility_types():
    rows = query("SELECT facility_type, COUNT(*) AS n FROM facilities GROUP BY facility_type ORDER BY n DESC")
    return jsonify([{"type": r["facility_type"], "count": int(r["n"])} for r in rows])


@bp.route("/api/facilities")
def facilities():
    rows = query("SELECT id, name, facility_type, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM facilities")
    return jsonify(rows)


@bp.route("/api/boundary")
def boundary():
    rows = query("SELECT ST_AsGeoJSON(geom) AS g FROM district_boundary LIMIT 1")
    return jsonify({"type": "Feature", "properties": {}, "geometry": json.loads(rows[0]["g"])})


@bp.route("/api/coverage")
def coverage():
    km = parse_radius()
    if km is None:
        return jsonify({"error": "radius_km must be a number between 0 and 100"}), 400
    feats, summary = build(km, request.args.get("facility_type", "all"))
    return jsonify({"summary": summary, "geojson": {"type": "FeatureCollection", "features": feats}})


@bp.route("/api/zones")
def zones():
    """Buffer + Union (coverage zone) and Difference (uncovered area), all in PostGIS (UTM 36S)."""
    km = parse_radius()
    if km is None:
        return jsonify({"error": "radius_km must be a number between 0 and 100"}), 400
    r = query("""
        WITH z AS (SELECT ST_Union(ST_Buffer(geom_utm, %(r)s)) AS g
                   FROM facilities WHERE (%(ft)s = 'all' OR facility_type = %(ft)s)),
             b AS (SELECT ST_Transform(geom, 32736) AS g FROM district_boundary LIMIT 1),
             d AS (SELECT ST_Difference(b.g, z.g) AS g, ST_Intersection(b.g, z.g) AS i, b.g AS bg FROM z, b)
        SELECT ST_AsGeoJSON(ST_Transform(d.i, 4326)) AS covered,
               ST_AsGeoJSON(ST_Transform(d.g, 4326)) AS uncovered,
               ROUND((ST_Area(d.i) / 1e6)::numeric, 1) AS covered_km2,
               ROUND((ST_Area(d.g) / 1e6)::numeric, 1) AS uncovered_km2,
               ROUND((ST_Area(d.bg) / 1e6)::numeric, 1) AS total_km2
        FROM d""", {"r": km * 1000, "ft": request.args.get("facility_type", "all")})[0]
    return jsonify({"covered": json.loads(r["covered"]), "uncovered": json.loads(r["uncovered"]),
                    "covered_km2": float(r["covered_km2"]), "uncovered_km2": float(r["uncovered_km2"]),
                    "total_km2": float(r["total_km2"])})


@bp.route("/api/underserved.csv")
def underserved_csv():
    km = parse_radius()
    if km is None:
        return jsonify({"error": "bad radius"}), 400
    feats, _ = build(km, request.args.get("facility_type", "all"))
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["name", "population", "distance_km", "nearest_facility", "facility_type"])
    for f in feats:
        p = f["properties"]
        if not p["covered"]:
            w.writerow([p["name"] or "Unnamed", p["population"] if p["population"] is not None else "unknown",
                        round(p["distance_m"] / 1000, 2), p["nearest_facility"], p["facility_type"]])
    return Response(out.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f"attachment; filename=underserved_{km}km.csv"})