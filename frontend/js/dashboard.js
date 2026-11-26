function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtKm(m) { return (m / 1000).toFixed(1) + " km"; }
const $ = id => document.getElementById(id);
const num = n => Number(n).toLocaleString();

function showSummary(s, z, feats) {
  const known = feats.filter(f => f.properties.population !== null);
  const totalPop = known.reduce((a, f) => a + f.properties.population, 0);
  $("totN").textContent = s.total;
  $("totPop").textContent = known.length ? num(totalPop) : "Not recorded";
  $("popNote").textContent = known.length
    ? `Recorded for ${known.length} of ${s.total} settlements`
    : "No population data in the source file";
  if (z) {
    $("areaTot").textContent = num(Math.round(z.total_km2)) + " km\u00b2";
    $("areaNote").innerHTML = `Covered: <b>${num(Math.round(z.covered_km2))} km\u00b2</b> (${(100 * z.covered_km2 / z.total_km2).toFixed(0)}%) &nbsp;|&nbsp; Not covered: <b>${num(Math.round(z.uncovered_km2))} km\u00b2</b>`;
  }
  $("covN").textContent = s.covered;  $("covP").textContent = s.pct_covered + "%";
  $("undN").textContent = s.underserved; $("undP").textContent = s.pct_underserved + "%";
  const pk = (n, unk, cnt) => (cnt - unk) > 0
    ? `${num(n)} people` + (unk ? ` (+${unk} with no population record)` : "")
    : "Population not recorded";
  $("covPop").textContent = pk(s.population_covered, s.pop_unknown_covered, s.covered);
  $("undPop").textContent = pk(s.population_underserved, s.pop_unknown_underserved, s.underserved);
}

function renderList(feats, onClick) {
  $("shown").textContent = feats.length + " shown";
  $("list").innerHTML = feats.length ? feats.map((f, i) => {
    const p = f.properties;
    return `<li data-i="${i}"><div><div class="n">${esc(p.name || "Unnamed settlement")}</div>` +
      `<div class="f">Nearest: ${esc(p.nearest_facility)} &middot; Pop. ${p.population !== null ? num(p.population) : "not recorded"}</div></div>` +
      `<div class="d ${p.covered ? "ok" : "bad"}">${fmtKm(p.distance_m)}</div></li>`;
  }).join("") : `<li>No settlements to show</li>`;
  $("list").querySelectorAll("li[data-i]").forEach(li => li.onclick = () => {
    $("list").querySelectorAll("li").forEach(x => x.classList.remove("on"));
    li.classList.add("on"); onClick(Number(li.dataset.i));
  });
}

function showSelected(p) {
  const s = $("sel");
  s.classList.remove("hidden");
  s.innerHTML = `<div class="t">Selected settlement <span class="tag ${p.covered ? "ok" : "bad"}">${p.covered ? "Covered" : "Underserved"}</span></div>` +
    `<div class="nm">${esc(p.name || "Unnamed settlement")}</div>` +
    `<div>${fmtKm(p.distance_m)} to ${esc(p.nearest_facility)}<br>Population: ${p.population !== null ? num(p.population) : "not recorded"}</div>`;
}

function renderData(feats) {
  $("vData").innerHTML = `<h2>Data Table</h2><div class="sub">Every settlement with its nearest health facility (${feats.length} rows).</div>` +
    `<table><tr><th>Settlement</th><th>Population</th><th>Nearest facility</th><th>Type</th><th>Distance</th><th>Status</th></tr>` +
    feats.map(f => { const p = f.properties;
      return `<tr><td>${esc(p.name || "Unnamed")}</td><td>${p.population !== null ? num(p.population) : "not recorded"}</td><td>${esc(p.nearest_facility)}</td><td>${esc(p.facility_type)}</td>` +
        `<td>${fmtKm(p.distance_m)}</td><td><span class="tag ${p.covered ? "ok" : "bad"}">${p.covered ? "Covered" : "Underserved"}</span></td></tr>`; }).join("") +
    `</table>`;
}

function renderAnalytics(rows, km) {
  $("vAnalytics").innerHTML = `<h2>Coverage by Facility Type</h2><div class="sub">Settlements within ${km} km of the nearest facility of each type.</div>` +
    `<table><tr><th>Facility type</th><th>Covered</th><th>Underserved</th><th>% covered</th><th></th></tr>` +
    rows.map(r => `<tr><td>${esc(r.label)}</td><td>${r.s.covered}</td><td>${r.s.underserved}</td><td>${r.s.pct_covered}%</td>` +
      `<td><div class="bar"><i style="width:${r.s.pct_covered}%"></i></div></td></tr>`).join("") + `</table>`;
}
//  facility counts.
const _baseSummary = showSummary;
showSummary = function (s, z, feats) {
  _baseSummary(s, z, feats);
  $("totPop").parentElement.querySelector(".sl").textContent = "Health facilities";
  const ft = $("ftype").value;
  const n = (typeof facilities !== "undefined")
    ? (ft === "all" ? facilities.length : facilities.filter(f => f.facility_type === ft).length) : "-";
  $("totPop").textContent = n;
  $("popNote").textContent = "Used in this analysis";
  $("covPop").textContent = "Within " + s.radius_km + " km of a facility";
  $("undPop").textContent = "More than " + s.radius_km + " km from a facility";
};
