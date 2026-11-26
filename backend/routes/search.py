from flask import Blueprint, request, jsonify
from routes.coverage import query

sbp = Blueprint("search", __name__)


@sbp.route("/api/search")
def search():
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"settlements": [], "facilities": []})
    like = "%" + q + "%"
    s = query("SELECT id, name FROM settlements WHERE name ILIKE %(l)s ORDER BY name LIMIT 8", {"l": like})
    f = query("SELECT id, name, facility_type FROM facilities WHERE name ILIKE %(l)s ORDER BY name LIMIT 8", {"l": like})
    return jsonify({"settlements": s, "facilities": f})


@sbp.route("/api/settlement/<int:sid>/nearest")
def nearest(sid):
    ft = request.args.get("facility_type", "all")
    s = query("SELECT id, name, population, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM settlements WHERE id = %(i)s", {"i": sid})
    if not s:
        return jsonify({"error": "settlement not found"}), 404
    f = query("""
        SELECT f.id, f.name, f.facility_type, ST_X(f.geom) AS lng, ST_Y(f.geom) AS lat,
               ROUND(ST_Distance(s.geom_utm, f.geom_utm)::numeric) AS distance_m
        FROM settlements s, facilities f
        WHERE s.id = %(i)s AND (%(ft)s = 'all' OR f.facility_type = %(ft)s)
        ORDER BY s.geom_utm <-> f.geom_utm
        LIMIT 3""", {"i": sid, "ft": ft})
    for r in f:
        r["distance_m"] = int(r["distance_m"])
    return jsonify({"settlement": s[0], "facilities": f})


@sbp.route("/api/facility/<int:fid>/covers")
def covers(fid):
    try:
        km = float(request.args.get("radius_km", 3))
    except ValueError:
        return jsonify({"error": "bad radius"}), 400
    if not 0 < km <= 100:
        return jsonify({"error": "radius_km must be between 0 and 100"}), 400
    f = query("SELECT id, name, facility_type, ST_X(geom) AS lng, ST_Y(geom) AS lat FROM facilities WHERE id = %(i)s", {"i": fid})
    if not f:
        return jsonify({"error": "facility not found"}), 404
    rows = query("""
        SELECT s.id, s.name, s.population, ST_X(s.geom) AS lng, ST_Y(s.geom) AS lat,
               ROUND(ST_Distance(s.geom_utm, f.geom_utm)::numeric) AS distance_m
        FROM facilities f
        JOIN settlements s ON ST_DWithin(s.geom_utm, f.geom_utm, %(r)s)
        WHERE f.id = %(i)s
        ORDER BY ST_Distance(s.geom_utm, f.geom_utm)""", {"i": fid, "r": km * 1000})
    for r in rows:
        r["distance_m"] = int(r["distance_m"])
    return jsonify({"facility": f[0], "radius_km": km, "settlements": rows})