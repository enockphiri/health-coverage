const map = L.map("map", { zoomControl: false }).setView([-13.98, 33.78], 9);
L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

const facilityLayer = L.layerGroup().addTo(map);
const zoneLayer = L.layerGroup().addTo(map);
const uncoveredLayer = L.layerGroup().addTo(map);
const settlementLayer = L.layerGroup().addTo(map);
let lastData = null, lastZones = null, view = "all", markers = {}, facilities = [], types = [], timer = null;

async function init() {
  try {
    const b = L.geoJSON(await apiGet("/api/boundary"), { style: { color: "#334155", weight: 2, fillOpacity: 0 } }).addTo(map);
    map.fitBounds(b.getBounds());
    facilities = await apiGet("/api/facilities");
    facilities.forEach(f =>
      L.circleMarker([f.lat, f.lng], { radius: 5, color: "#0b4f4f", fillColor: "#0b4f4f", fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(f.name)}</b><br>${esc(f.facility_type)}`).addTo(facilityLayer));
    types = await apiGet("/api/facility_types");
    types.forEach(t => {
      const o = document.createElement("option");
      o.value = t.type; o.textContent = `${t.type} (${t.count})`; $("ftype").appendChild(o);
    });
    analyse();
  } catch (e) { $("popNote").textContent = "Could not reach the API: " + e.message; }
}

async function analyse() {
  const v = parseFloat($("radius").value);
  if (!(v > 0 && v <= 100)) return;
  const km = encodeURIComponent(v), ft = encodeURIComponent($("ftype").value);
  try {
    [lastData, lastZones] = await Promise.all([
      apiGet(`/api/coverage?radius_km=${km}&facility_type=${ft}`),
      apiGet(`/api/zones?radius_km=${km}&facility_type=${ft}`)]);
    $("csv").href = `${API_BASE}/api/underserved.csv?radius_km=${km}&facility_type=${ft}`;
    showSummary(lastData.summary, lastZones, lastData.geojson.features);
    drawLayers();
    if (!$("vAnalytics").classList.contains("hidden")) loadAnalytics();
  } catch (e) { $("popNote").textContent = "Error: " + e.message; }
}

function drawLayers() {
  zoneLayer.clearLayers(); uncoveredLayer.clearLayers(); settlementLayer.clearLayers();
  if (!lastData) return;
  if ($("showZones").checked && lastZones.covered)
    L.geoJSON(lastZones.covered, { style: { color: "#3b82f6", weight: 1, dashArray: "4", fillColor: "#93c5fd", fillOpacity: 0.3 } }).addTo(zoneLayer);
  if ($("showUncovered").checked && lastZones.uncovered)
    L.geoJSON(lastZones.uncovered, { style: { color: "#ef4444", weight: 1, fillColor: "#fecaca", fillOpacity: 0.3 } }).addTo(uncoveredLayer);

  const all = lastData.geojson.features.slice().sort((a, b) => b.properties.distance_m - a.properties.distance_m);
  markers = {};
  all.forEach((f, idx) => {
    const p = f.properties, [lng, lat] = f.geometry.coordinates;
    if (p.covered ? !$("showCovered").checked : !$("showUnder").checked) return;
    const m = L.circleMarker([lat, lng], {
      radius: 6, color: "#fff", weight: 1, fillColor: p.covered ? "#0f766e" : "#b91c1c", fillOpacity: 0.95
    }).bindPopup(
      `<b>${esc(p.name || "Unnamed settlement")}</b><br>Population: ${p.population !== null ? num(p.population) : "not recorded"}<br>` +
      `Nearest: ${esc(p.nearest_facility)} (${esc(p.facility_type)})<br>Distance: ${fmtKm(p.distance_m)}`
    ).addTo(settlementLayer);
    m.on("click", () => showSelected(p));
    markers[idx] = m;
  });
  const shown = all.map((f, idx) => ({ f, idx })).filter(x =>
    view === "all" || (view === "covered" ? x.f.properties.covered : !x.f.properties.covered));
  renderList(shown.map(x => x.f), i => {
    const m = markers[shown[i].idx];
    showSelected(shown[i].f.properties);
    if (m) { map.setView(m.getLatLng(), 13); m.openPopup(); }
  });
  renderData(all);
}

async function loadAnalytics() {
  const km = $("radius").value;
  const list = [{ label: "All facility types", v: "all" }, ...types.map(t => ({ label: t.type, v: t.type }))];
  const res = await Promise.all(list.map(x =>
    apiGet(`/api/coverage?radius_km=${encodeURIComponent(km)}&facility_type=${encodeURIComponent(x.v)}`)
      .then(d => ({ label: x.label, s: d.summary }))));
  renderAnalytics(res, km);
}

$("radius").oninput = () => { clearTimeout(timer); timer = setTimeout(analyse, 600); };
$("radius").onkeydown = e => { if (e.key === "Enter") { clearTimeout(timer); analyse(); } };
$("ftype").onchange = analyse;
["showZones", "showUncovered", "showCovered", "showUnder"].forEach(id => $(id).onchange = drawLayers);
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); view = b.dataset.view; drawLayers();
});
document.querySelectorAll("#mainTabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#mainTabs button").forEach(x => x.classList.remove("active"));
  b.classList.add("active");
  $("vMap").classList.toggle("hidden", b.dataset.v !== "map");
  $("vAnalytics").classList.toggle("hidden", b.dataset.v !== "analytics");
  $("vData").classList.toggle("hidden", b.dataset.v !== "data");
  if (b.dataset.v === "map") setTimeout(() => map.invalidateSize(), 50);
  if (b.dataset.v === "analytics") loadAnalytics();
});
init();
// ---------------- Search ----------------
const searchLayer = L.layerGroup().addTo(map);
(function () {
  const box = document.createElement("div");
  box.className = "sec";
  box.innerHTML = '<div class="h">Search</div>' +
    '<input id="q" class="qbox" type="search" placeholder="Search a settlement or health facility" autocomplete="off">' +
    '<div id="qres"></div><div id="qinfo"></div>';
  $("side").insertBefore(box, $("side").firstChild);
})();

function clearSearch() { searchLayer.clearLayers(); $("qinfo").innerHTML = ""; $("q").value = ""; $("qres").innerHTML = ""; }
const popTxt = p => (p !== null && p !== undefined) ? num(p) : "not recorded";
let qTimer = null;

$("q").oninput = () => {
  clearTimeout(qTimer);
  const q = $("q").value.trim();
  if (q.length < 2) { $("qres").innerHTML = ""; return; }
  qTimer = setTimeout(async () => {
    try {
      const r = await apiGet("/api/search?q=" + encodeURIComponent(q));
      const rows = [
        ...r.settlements.map(x => ({ ...x, kind: "settlement" })),
        ...r.facilities.map(x => ({ ...x, kind: "facility" }))];
      $("qres").innerHTML = rows.length
        ? rows.map((x, i) => '<div class="qr" data-i="' + i + '"><b>' + esc(x.name || "Unnamed") + '</b><span>' +
            (x.kind === "facility" ? esc(x.facility_type) : "Settlement") + '</span></div>').join("")
        : '<div class="qr">No match found</div>';
      $("qres").querySelectorAll(".qr[data-i]").forEach(el => el.onclick = () => {
        const x = rows[Number(el.dataset.i)];
        $("qres").innerHTML = "";
        if (x.kind === "facility") showFacility(x); else showSettlement(x);
      });
    } catch (e) { $("qres").textContent = "Search failed: " + e.message; }
  }, 300);
};

async function showSettlement(x) {
  try {
    const d = await apiGet("/api/settlement/" + x.id + "/nearest?facility_type=" + encodeURIComponent($("ftype").value));
    const s = d.settlement, km = parseFloat($("radius").value) || 3;
    searchLayer.clearLayers();
    L.circleMarker([s.lat, s.lng], { radius: 10, color: "#f59e0b", weight: 3, fillColor: "#fff", fillOpacity: 1 })
      .bindPopup("<b>" + esc(s.name || "Unnamed") + "</b><br>Population: " + popTxt(s.population)).addTo(searchLayer);
    const pts = [[s.lat, s.lng]];
    d.facilities.forEach((f, i) => {
      L.polyline([[s.lat, s.lng], [f.lat, f.lng]], { color: "#0b4f4f", weight: i === 0 ? 3 : 1.5, dashArray: i === 0 ? null : "5" }).addTo(searchLayer);
      L.circleMarker([f.lat, f.lng], { radius: 8, color: "#0b4f4f", weight: 2, fillColor: "#facc15", fillOpacity: 1 })
        .bindPopup("<b>" + esc(f.name) + "</b><br>" + esc(f.facility_type) + "<br>" + fmtKm(f.distance_m)).addTo(searchLayer);
      pts.push([f.lat, f.lng]);
    });
    map.fitBounds(pts, { padding: [60, 60] });
    const covered = d.facilities.length && d.facilities[0].distance_m <= km * 1000;
    $("qinfo").innerHTML = '<div class="res"><h4>' + esc(s.name || "Unnamed settlement") +
      ' <span class="tag ' + (covered ? "ok" : "bad") + '">' + (covered ? "Covered" : "Underserved") + ' at ' + km + ' km</span></h4>' +
      '<div class="r"><span>Population</span><b>' + popTxt(s.population) + '</b></div>' +
      '<div style="margin:6px 0 2px;color:#6b7280">Nearest health facilities</div>' +
      d.facilities.map(f => '<div class="r"><span>' + esc(f.name) + ' (' + esc(f.facility_type) + ')</span><b>' + fmtKm(f.distance_m) + '</b></div>').join("") +
      '<div style="margin-top:6px"><a onclick="clearSearch()">Clear search</a></div></div>';
  } catch (e) { $("qinfo").textContent = "Error: " + e.message; }
}

async function showFacility(x) {
  try {
    const km = parseFloat($("radius").value) || 3;
    const d = await apiGet("/api/facility/" + x.id + "/covers?radius_km=" + encodeURIComponent(km));
    const f = d.facility;
    searchLayer.clearLayers();
    const c = L.circle([f.lat, f.lng], { radius: km * 1000, color: "#f59e0b", weight: 2, fillColor: "#fde68a", fillOpacity: 0.25 }).addTo(searchLayer);
    L.circleMarker([f.lat, f.lng], { radius: 9, color: "#0b4f4f", weight: 2, fillColor: "#facc15", fillOpacity: 1 })
      .bindPopup("<b>" + esc(f.name) + "</b><br>" + esc(f.facility_type)).addTo(searchLayer);
    d.settlements.forEach(s => L.circleMarker([s.lat, s.lng], { radius: 6, color: "#fff", weight: 1, fillColor: "#f59e0b", fillOpacity: 1 })
      .bindPopup("<b>" + esc(s.name || "Unnamed") + "</b><br>" + fmtKm(s.distance_m) + " from " + esc(f.name)).addTo(searchLayer));
    map.fitBounds(c.getBounds(), { padding: [30, 30] });
    $("qinfo").innerHTML = '<div class="res"><h4>' + esc(f.name) + '</h4>' +
      '<div class="r"><span>Type</span><b>' + esc(f.facility_type) + '</b></div>' +
      '<div class="r"><span>Settlements within ' + km + ' km</span><b>' + d.settlements.length + '</b></div>' +
      '<div style="max-height:220px;overflow-y:auto;margin-top:6px">' +
      (d.settlements.length ? d.settlements.map(s => '<div class="r"><span>' + esc(s.name || "Unnamed") + '</span><b>' + fmtKm(s.distance_m) + '</b></div>').join("")
        : "No settlements within this distance") +
      '</div><div style="margin-top:6px"><a onclick="clearSearch()">Clear search</a></div></div>';
  } catch (e) { $("qinfo").textContent = "Error: " + e.message; }
}
