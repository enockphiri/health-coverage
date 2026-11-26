// Change this in one place if the backend moves.
const API_BASE = "http://127.0.0.1:5000";

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    let msg = "API error " + res.status;
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }
  return res.json();
}