/* Spin: a decision wheel. The whole wheel lives in the link. No accounts, no server. */
(function () {
  "use strict";

  const PALETTE = ["#FF3B5C", "#FF8A1F", "#FFD400", "#1DE9A6", "#2E9BFF", "#9B5CFF", "#FF4FB0", "#5CE840"];
  const PLUM = "#2A1838";
  const TAU = Math.PI * 2;
  const POINTER = -Math.PI / 2;          // the pointer sits at the top
  const MAX_ITEMS = 60;
  const HISTORY_MAX = 10;
  const LS = { saved: "spin-saved-v1", prefs: "spin-prefs-v1", last: "spin-last-v1" };

  const $ = (id) => document.getElementById(id);
  const el = {
    canvas: $("wheel"), wrap: $("wheelWrap"), hub: $("spinHub"), spinBtn: $("spinBtn"), shuffleBtn: $("shuffleBtn"),
    title: $("titleInput"), items: $("items"), addBtn: $("addBtn"), clearBtn: $("clearBtn"),
    pasteToggle: $("pasteToggle"), pasteBox: $("pasteBox"), pasteArea: $("pasteArea"), pasteApply: $("pasteApply"),
    presets: $("presets"), shareUrl: $("shareUrl"), copyBtn: $("copyBtn"), nativeShare: $("nativeShare"), qr: $("qr"), qrDownload: $("qrDownload"),
    saveBtn: $("saveBtn"), savedList: $("savedList"), savedEmpty: $("savedEmpty"),
    soundSel: $("soundSel"), removeSel: $("removeSel"), hiddenSel: $("hiddenSel"), themeSel: $("themeSel"), lookSel: $("lookSel"), resetBtn: $("resetBtn"),
    muteBtn: $("muteBtn"), themeBtn: $("themeBtn"), bigBtn: $("bigBtn"),
    overlay: $("overlay"), confetti: $("confetti"), winnerText: $("winnerText"), winnerSub: $("winnerSub"),
    againBtn: $("againBtn"), removeAgainBtn: $("removeAgainBtn"), closeBtn: $("closeBtn"),
    history: $("history"), historyChips: $("historyChips"), historyClear: $("historyClear"), emptyHint: $("emptyHint"), toast: $("toast"),
    teamNames: $("teamNames"), teamsMinus: $("teamsMinus"), teamsPlus: $("teamsPlus"), teamsCount: $("teamsCount"), teamsNext: $("teamsNext"),
    teamList: $("teamList"), modeOne: $("modeOne"), modeAll: $("modeAll"), teamsShuffle: $("teamsShuffle"), teamsReset: $("teamsReset"),
  };

  // ---------- state ----------
  const PRESETS = [
    { name: "Yes or no", sub: "The classic", items: ["Yes", "No", "Yes", "No"] },
    { name: "Coin", sub: "Heads or tails", items: ["Heads", "Tails"] },
    { name: "Dice", sub: "One to six", items: ["1", "2", "3", "4", "5", "6"] },
    { name: "Who goes first", sub: "Rename the players", items: ["Player 1", "Player 2", "Player 3", "Player 4"] },
    { name: "What to eat", sub: "Dinner, decided", items: ["Pizza", "Pasta", "Sushi", "Burger", "Salad", "Tacos", "Curry", "Soup"] },
    { name: "Numbers 1 to 10", sub: "Pick a number", items: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] },
    { name: "Chores", sub: "Nobody argues with a wheel", items: ["Dishes", "Bins", "Hoover", "Laundry", "Table", "Bathroom"] },
    { name: "Movie night", sub: "Genre roulette", items: ["Comedy", "Adventure", "Animation", "Sci-fi", "Mystery", "Classic"] },
  ];

  let state = fresh();
  function fresh() {
    return { title: "", items: PRESETS[4].items.map((t, i) => ({ t, c: i % PALETTE.length, w: 1 })), hidden: false, remove: false, sound: "classic", mode: "wheel", teams: freshTeams() };
  }
  function freshTeams() { return { names: [], count: 2, labels: [], assigned: [], all: false }; }
  let popFrom = -1;   // names placed in a cascade get a pop animation
  let popOne = -1;    // the one name a single spin just placed pops too
  let teamsAppear = null;   // "all" or the index of a team card that should pop in
  let cascadeItems = false; // the next full render of the option rows cascades in
  const TEAM_WORDS = ["Red", "Orange", "Yellow", "Mint", "Blue", "Violet", "Pink", "Green"];
  function teamLabel(i) { return (state.teams.labels[i] || "").trim() || "Team " + TEAM_WORDS[i % TEAM_WORDS.length]; }
  function teamSizes() { const z = new Array(state.teams.count).fill(0); state.teams.assigned.forEach((t) => { if (t >= 0 && t < z.length) z[t]++; }); return z; }
  // balanced: a team may take a name while it is below floor, or at floor while fewer than (total mod count) teams went above
  function teamOpen(i, sizes) {
    const total = state.teams.names.length, n = state.teams.count, fl = Math.floor(total / n), extra = total % n;
    const big = sizes.filter((z) => z > fl).length;
    return sizes[i] < fl || (sizes[i] === fl && big < extra);
  }
  function nextNameIndex() { return state.teams.assigned.findIndex((t) => t < 0); }
  let prefs = loadJSON(LS.prefs, { muted: false, theme: "system" });
  let history = [];
  let dirtyUrl = false;

  // ---------- link encoding ----------
  function encodeState(s) {
    const compact = { t: s.title || "", i: s.items.map((it) => [it.t, it.c, it.w]), h: s.hidden ? 1 : 0, r: s.remove ? 1 : 0, s: s.sound };
    if (s.mode === "teams") compact.m = "t";
    if (s.teams && s.teams.names.length) compact.g = { n: s.teams.names, c: s.teams.count, l: s.teams.labels, a: s.teams.assigned, x: s.teams.all ? 1 : 0 };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodeState(str) {
    try {
      const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
      const bin = atob(b64);
      const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
      const c = JSON.parse(new TextDecoder().decode(bytes));
      if (!c || !Array.isArray(c.i)) return null;
      const items = c.i.slice(0, MAX_ITEMS).map((a, i) => ({
        t: String(a[0] ?? "").slice(0, 60),
        c: clampInt(a[1], 0, PALETTE.length - 1, i % PALETTE.length),
        w: clampInt(a[2], 1, 9, 1),
      }));
      const teams = freshTeams();
      if (c.g && Array.isArray(c.g.n)) {
        teams.names = c.g.n.slice(0, 200).map((x) => String(x).slice(0, 40));
        teams.count = clampInt(c.g.c, 2, 8, 2);
        teams.labels = Array.isArray(c.g.l) ? c.g.l.slice(0, 8).map((x) => String(x || "").slice(0, 24)) : [];
        teams.assigned = teams.names.map((_, i) => clampInt(Array.isArray(c.g.a) ? c.g.a[i] : -1, -1, teams.count - 1, -1));
        teams.all = !!c.g.x;
      }
      return { title: String(c.t || "").slice(0, 48), items, hidden: !!c.h, remove: !!c.r, sound: ["classic", "drums", "chime"].includes(c.s) ? c.s : "classic", mode: c.m === "t" ? "teams" : "wheel", teams };
    } catch (e) { return null; }
  }
  function clampInt(v, lo, hi, dflt) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; }
  function shareLink() { return location.origin + location.pathname + "#w=" + encodeState(state); }
  function syncUrl() {
    const link = "#w=" + encodeState(state);
    if (location.hash !== link) history_replace(link);
    el.shareUrl.value = shareLink();
    dirtyUrl = true;
    try { localStorage.setItem(LS.last, JSON.stringify(state)); } catch (e) {}
  }
  function history_replace(hash) { try { window.history.replaceState(null, "", hash); } catch (e) { location.hash = hash; } }
  function loadJSON(key, dflt) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? dflt : v; } catch (e) { return dflt; } }
  function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  // ---------- sounds ----------
  let ac = null;
  function audio() {
    if (prefs.muted) return null;
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(ctx, { f = 440, type = "sine", t = 0, dur = 0.2, gain = 0.2, slideTo = null }) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, ctx.currentTime + t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + t + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + dur);
    o.connect(g).connect(ctx.destination); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + dur + 0.02);
  }
  function noise(ctx, { t = 0, dur = 0.05, gain = 0.15, hp = 1000 }) {
    const n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = hp;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(ctx.destination); src.start(ctx.currentTime + t);
  }
  const SOUNDS = {
    classic: {
      tick(ctx, speed) { tone(ctx, { f: 1500 + Math.min(900, speed * 40), type: "square", dur: 0.025, gain: 0.05 }); },
      win(ctx) { [523, 659, 784, 1046].forEach((f, i) => tone(ctx, { f, type: "triangle", t: i * 0.09, dur: i === 3 ? 0.6 : 0.16, gain: 0.18 })); },
    },
    drums: {
      tick(ctx) { noise(ctx, { dur: 0.04, gain: 0.12, hp: 1800 }); tone(ctx, { f: 160, type: "sine", dur: 0.04, gain: 0.08, slideTo: 60 }); },
      win(ctx) { tone(ctx, { f: 120, type: "sine", dur: 0.35, gain: 0.3, slideTo: 40 }); noise(ctx, { dur: 0.9, gain: 0.18, hp: 4000 }); noise(ctx, { t: 0.02, dur: 0.6, gain: 0.1, hp: 800 }); },
    },
    chime: {
      tick(ctx) { tone(ctx, { f: 1760, type: "sine", dur: 0.06, gain: 0.04 }); },
      win(ctx) { [784, 988, 1175, 1568].forEach((f, i) => { tone(ctx, { f, type: "sine", t: i * 0.12, dur: 1.1, gain: 0.14 }); tone(ctx, { f: f * 2.01, type: "sine", t: i * 0.12, dur: 0.5, gain: 0.04 }); }); },
    },
  };
  function playTick(speed) { const ctx = audio(); if (ctx) SOUNDS[state.sound].tick(ctx, speed); if (navigator.vibrate && !reduceMotion) { try { navigator.vibrate(6); } catch (e) {} } }
  function playWin() { const ctx = audio(); if (ctx) SOUNDS[state.sound].win(ctx); }

  // ---------- wheel ----------
  const ctx2d = el.canvas.getContext("2d");
  let angle = 0, vel = 0, spinning = false, lastT = 0, lastIdx = -1, flex = 0, flexDir = 1, size = 0, dpr = 1;
  let drag = null;   // {a0, angle0, samples:[{t,a}]}
  let raf = 0;
  let revealed = false;                 // hidden-labels mode: labels show only after a spin has stopped
  let windup = null;                    // {t0, from}: the little kick back before a spin launches
  let intro = { t0: performance.now(), dur: 700 };   // entrance animation
  let glow = null;                      // {idx, until}: the winning slice glows after the card closes
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function slices() {
    if (state.mode === "teams") {
      const sizes = teamSizes(); const open = [];
      const done = state.teams.names.length > 0 && nextNameIndex() < 0;   // finished: show every team, the wheel just rests
      for (let i = 0; i < state.teams.count; i++) if (state.teams.names.length && (done || teamOpen(i, sizes))) open.push(i);
      let a = 0; const span = open.length ? TAU / open.length : 0;
      return open.map((i) => { const s = { it: { t: teamLabel(i), c: i % PALETTE.length, w: 1, team: i }, start: a, end: a + span, mid: a + span / 2 }; a += span; return s; });
    }
    const items = state.items.filter((it) => it.t.trim() !== "" || state.items.length <= 1);
    const total = items.reduce((s, it) => s + it.w, 0) || 1;
    let a = 0;
    return items.map((it) => { const span = TAU * it.w / total; const s = { it, start: a, end: a + span, mid: a + span / 2 }; a += span; return s; });
  }
  function indexAt(theta, sl) {
    // which slice is under the pointer, given the wheel rotation theta
    let a = ((POINTER - theta) % TAU + TAU) % TAU;
    for (let i = 0; i < sl.length; i++) if (a >= sl[i].start && a < sl[i].end) return i;
    return sl.length - 1;
  }
  // Slices appear: on first draw the wheel fans open, and when options change the slices glide to make room
  // (a new one grows out of the seam where it was added). Purely visual: the winner always comes from slices().
  const layIds = new WeakMap(); let layNext = 1;
  function layKey(it) { if (it.team != null) return "t" + it.team; let id = layIds.get(it); if (!id) { id = layNext++; layIds.set(it, id); } return id; }
  const lay = { sig: null, from: new Map(), cur: new Map(), t0: 0 }; let layBusy = false;
  function layout(target) {
    const now = performance.now();
    const sig = target.map((t) => layKey(t.it) + ":" + t.start.toFixed(4) + ":" + t.end.toFixed(4)).join("|");
    if (sig !== lay.sig) {
      const from = new Map(); let cursor = 0;
      for (const t of target) { const k = layKey(t.it), c = lay.cur.get(k); if (c) { from.set(k, c); cursor = c.end; } else from.set(k, { start: cursor, end: cursor }); }
      lay.from = from; lay.sig = sig; lay.t0 = now;
    }
    const k = reduceMotion ? 1 : Math.min(1, (now - lay.t0) / 460), e = 1 - Math.pow(1 - k, 3);
    const cur = new Map();
    const out = target.map((t) => { const key = layKey(t.it), f = lay.from.get(key); const st = f.start + (t.start - f.start) * e, en = f.end + (t.end - f.end) * e; cur.set(key, { start: st, end: en }); return { it: t.it, start: st, end: en, mid: (st + en) / 2 }; });
    lay.cur = cur; layBusy = k < 1; if (layBusy) tick();
    return out;
  }
  function resize() {
    const r = el.wrap.getBoundingClientRect();
    dpr = Math.min(2.5, window.devicePixelRatio || 1);
    size = Math.max(200, Math.floor(r.width));
    el.canvas.width = Math.floor(size * dpr); el.canvas.height = Math.floor(size * dpr);
    draw();
  }
  function draw() {
    const sl = layout(slices()); const n = sl.length;
    const c = size / 2;
    let scale = 1;
    if (intro) { const k = Math.min(1, (performance.now() - intro.t0) / intro.dur); scale = reduceMotion ? 1 : 0.72 + 0.28 * (1 - Math.pow(1 - k, 3)) * (1 + 0.08 * Math.sin(k * Math.PI)); if (k >= 1) intro = null; }
    const R = (c - c * 0.06) * scale;
    const x = ctx2d; x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, size, size);
    // soft shadow under the wheel
    x.save(); x.translate(c, c);
    x.beginPath(); x.arc(0, c * 0.03, R + c * 0.045, 0, TAU); x.fillStyle = "rgba(42,24,56,.28)"; x.filter = "blur(" + c * 0.06 + "px)"; x.fill(); x.filter = "none";
    // outer glass ring
    x.beginPath(); x.arc(0, 0, R + c * 0.045, 0, TAU); x.fillStyle = "rgba(42,24,56,.9)"; x.fill();
    x.beginPath(); x.arc(0, 0, R + c * 0.045, 0, TAU); x.lineWidth = 2; x.strokeStyle = "rgba(255,255,255,.35)"; x.stroke();
    x.rotate(angle);
    if (n === 0) {
      x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fillStyle = "rgba(255,255,255,.15)"; x.fill();
    }
    const showLabels = state.mode === "teams" || !(state.hidden && !revealed);
    const glowing = glow && glow.until > performance.now() ? glow : null;
    for (let i = 0; i < n; i++) {
      const s = sl[i];
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, s.start, s.end); x.closePath();
      x.fillStyle = PALETTE[s.it.c % PALETTE.length]; x.fill();
      if (glowing && i !== glowing.idx) { x.fillStyle = "rgba(42,24,56,.42)"; x.fill(); }
      x.lineWidth = n > 1 ? Math.max(1.5, c * 0.006) : 0; x.strokeStyle = "rgba(42,24,56,.85)"; if (n > 1) x.stroke();
      // label
      const span = s.end - s.start;
      if (span < 0.06) continue;   // too thin for a label while it grows
      const label = showLabels ? s.it.t.trim() : "?";
      // labels always read left to right on screen: slices on the left half are drawn flipped
      const flip = Math.cos(s.mid + angle) < 0;
      x.save(); x.rotate(s.mid + (flip ? Math.PI : 0));
      const maxW = R * 0.66;
      const fs = label === "?" ? c * 0.16 : Math.max(10, Math.min(c * 0.11, span * R * 0.42, (maxW * 1.5) / Math.max(3, label.length)));
      x.font = `800 ${fs}px Manrope, system-ui, sans-serif`; x.textBaseline = "middle"; x.fillStyle = PLUM;
      const txt = fit(x, label, maxW);
      if (flip) { x.textAlign = "left"; x.fillText(txt, -R * 0.9, 0); } else { x.textAlign = "right"; x.fillText(txt, R * 0.9, 0); }
      x.restore();
    }
    if (glowing) {
      const s = sl[glowing.idx], k = ((glowing.until - performance.now()) / 1400); const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 110);
      x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, R, s.start, s.end); x.closePath();
      x.lineWidth = c * 0.02 + pulse * c * 0.01; x.strokeStyle = "rgba(255,255,255," + (0.5 + 0.4 * pulse) * Math.min(1, k * 3) + ")"; x.stroke();
    }
    // pegs at the boundaries
    if (n > 1) for (const s of sl) { x.beginPath(); x.arc(Math.cos(s.start) * (R + c * 0.02), Math.sin(s.start) * (R + c * 0.02), c * 0.012, 0, TAU); x.fillStyle = "rgba(255,255,255,.75)"; x.fill(); }
    // glass highlight (frost)
    x.rotate(-angle);
    const g = x.createRadialGradient(-R * 0.4, -R * 0.5, 0, 0, 0, R * 1.1);
    g.addColorStop(0, "rgba(255,255,255,.2)"); g.addColorStop(0.5, "rgba(255,255,255,.03)"); g.addColorStop(1, "rgba(255,255,255,0)");
    x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fillStyle = g; x.fill();
    x.restore();
    // pointer with flex
    x.save(); x.translate(c, c * 0.045);
    x.rotate(flex * 0.35 * flexDir);
    x.beginPath(); x.moveTo(-c * 0.07, -c * 0.02); x.lineTo(c * 0.07, -c * 0.02); x.lineTo(0, c * 0.11); x.closePath();
    x.fillStyle = "#FFF4E6"; x.shadowColor = "rgba(42,24,56,.4)"; x.shadowBlur = 8; x.shadowOffsetY = 3; x.fill();
    x.shadowColor = "transparent"; x.lineWidth = 2; x.strokeStyle = PLUM; x.stroke();
    x.restore();
  }
  function fit(x, text, maxW) {
    if (x.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (x.measureText(text.slice(0, m) + "…").width <= maxW) lo = m; else hi = m - 1; }
    return text.slice(0, Math.max(1, lo)) + "…";
  }

  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (windup) {
      const k = Math.min(1, (t - windup.t0) / 160);
      angle = windup.from - 0.22 * Math.sin(k * Math.PI / 2);
      if (k >= 1) { windup = null; spinning = true; }
    } else if (spinning) {
      angle += vel * dt;
      // friction: stronger when slow so it settles cleanly
      const decel = 0.55 + 1.2 / (1 + Math.abs(vel));
      vel -= vel * decel * dt;
      if (Math.abs(vel) < 0.08) { vel = 0; spinning = false; onStop(); }
    }
    const sl = slices();
    if (sl.length > 1) {
      const idx = indexAt(angle, sl);
      if (idx !== lastIdx) {
        if (lastIdx !== -1 && (spinning || drag)) { playTick(Math.abs(vel)); flex = 1; flexDir = vel >= 0 ? 1 : -1; }
        lastIdx = idx;
      }
    }
    if (flex > 0) flex = Math.max(0, flex - dt * 7);
    draw();
    const busy = spinning || drag || windup || intro || layBusy || flex > 0 || (glow && glow.until > performance.now());
    if (busy) raf = requestAnimationFrame(frame); else raf = 0;
  }
  function tick() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame); } }

  function canSpin() { return state.mode === "teams" ? slices().length >= 1 && nextNameIndex() >= 0 : slices().length >= 2; }
  function spin(power) {
    if (!canSpin() || spinning || windup) return;
    audio();
    revealed = false; glow = null;
    vel = power || 20 + Math.random() * 12;      // rad/s
    el.hub.disabled = true; el.spinBtn.disabled = true; el.hub.setAttribute("aria-busy", "true");
    if (reduceMotion) spinning = true; else windup = { t0: performance.now(), from: angle };
    tick();
  }
  function onStop() {
    revealed = true;
    const sl = slices(); if (sl.length < (state.mode === "teams" ? 1 : 2)) return;
    const idx = indexAt(angle, sl); const win = sl[idx].it;
    el.hub.disabled = false; el.spinBtn.disabled = false; el.hub.removeAttribute("aria-busy");
    flex = 1; flexDir = 1;
    // nudge the wheel so the pointer sits clearly inside the slice (never on the line)
    const a = ((POINTER - angle) % TAU + TAU) % TAU; const edge = Math.min(a - sl[idx].start, sl[idx].end - a);
    if (edge < 0.02) angle += (a - sl[idx].start < sl[idx].end - a ? -0.03 : 0.03);
    draw();
    showWinner(win);
  }

  // drag to fling
  function pointerAngle(e) { const r = el.canvas.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); }
  el.canvas.addEventListener("pointerdown", (e) => {
    if (spinning || windup || !canSpin()) return;
    el.canvas.setPointerCapture(e.pointerId); el.canvas.classList.add("is-dragging");
    drag = { a0: pointerAngle(e), angle0: angle, samples: [{ t: performance.now(), a: angle }] };
    audio(); tick();
  });
  el.canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    let d = pointerAngle(e) - drag.a0; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    angle = drag.angle0 + d;
    drag.samples.push({ t: performance.now(), a: angle }); if (drag.samples.length > 6) drag.samples.shift();
  });
  function endDrag() {
    if (!drag) return;
    el.canvas.classList.remove("is-dragging");
    const s = drag.samples; drag = null;
    if (s.length >= 2) {
      const a = s[0], b = s[s.length - 1]; const dt = (b.t - a.t) / 1000;
      let da = b.a - a.a;
      const v = dt > 0 ? da / dt : 0;
      if (Math.abs(v) > 2.5) { vel = Math.max(-40, Math.min(40, v)); revealed = false; glow = null; spinning = true; el.hub.disabled = true; el.spinBtn.disabled = true; el.hub.setAttribute("aria-busy", "true"); }
    }
    tick();
  }
  el.canvas.addEventListener("pointerup", endDrag);
  el.canvas.addEventListener("pointercancel", endDrag);
  el.canvas.addEventListener("lostpointercapture", endDrag);
  el.hub.addEventListener("click", () => spin());
  el.spinBtn.addEventListener("click", () => spin());
  window.addEventListener("keydown", (e) => {
    if (e.key === " " && !["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(document.activeElement.tagName)) { e.preventDefault(); if (el.overlay.hidden) spin(); }
    if (e.key === "Escape") { if (!el.overlay.hidden) closeWinner(); else if (document.body.classList.contains("big")) setBig(false); }
  });

  // ---------- winner ----------
  let lastWinner = null;
  function showWinner(win) {
    lastWinner = win;
    const col = PALETTE[win.c % PALETTE.length];
    el.winnerText.style.setProperty("--w1", col); el.winnerText.style.setProperty("--w2", PALETTE[(win.c + 1) % PALETTE.length]);
    if (state.mode === "teams") {
      const ni = nextNameIndex(); const name = state.teams.names[ni];
      state.teams.assigned[ni] = win.team; popOne = state.teams.all ? -1 : ni;
      pushHistory({ t: name + ": " + teamLabel(win.team), c: win.c });
      if (state.teams.all) {
        // one spin places everyone: the landed name goes to the landed team, the rest fill up the teams in balance
        popFrom = 0; placeRest();
        el.winnerText.textContent = "Teams ready";
        el.winnerSub.textContent = name + " starts " + teamLabel(win.team) + ", everyone else found a team";
        el.againBtn.textContent = "Show the teams";
      } else {
        el.winnerText.textContent = name;
        const left = state.teams.assigned.filter((t) => t < 0).length;
        el.winnerSub.textContent = "joins " + teamLabel(win.team) + (left ? " · " + left + " to go" : " · everyone is placed");
        el.againBtn.textContent = left ? "Next name" : "Show the teams";
      }
      el.removeAgainBtn.hidden = true;
      resetCard(); el.overlay.hidden = false; el.againBtn.focus();
      playWin(); confetti(col);
      renderTeams(); changed();
      return;
    }
    el.againBtn.textContent = "Spin again"; el.removeAgainBtn.hidden = false;
    el.winnerText.textContent = win.t.trim() || "(blank)";
    el.winnerSub.textContent = state.remove ? "This one leaves the wheel now." : "";
    resetCard(); el.overlay.hidden = false; el.againBtn.focus();
    pushHistory(win); playWin(); confetti(col);
    if (state.remove) { removeItem(win); }
  }
  function closeWinner() {
    el.overlay.hidden = true; stopConfetti();
    if (lastWinner) { const sl = slices(); const i = sl.findIndex((s) => s.it === lastWinner || (lastWinner.team != null && s.it.team === lastWinner.team)); if (i >= 0) { glow = { idx: i, until: performance.now() + 1400 }; tick(); } }
  }
  el.closeBtn.addEventListener("click", closeWinner);
  el.overlay.addEventListener("click", (e) => { if (e.target === el.overlay) closeWinner(); });
  el.againBtn.addEventListener("click", () => { closeWinner(); if (state.mode === "teams" && nextNameIndex() < 0) { setTab("teams"); return; } spin(); });
  el.removeAgainBtn.addEventListener("click", () => { if (lastWinner && !state.remove) removeItem(lastWinner); closeWinner(); spin(); });
  function removeItem(it) {
    const i = state.items.indexOf(it); if (i >= 0) state.items.splice(i, 1);
    lastIdx = -1; renderItems(); changed();
    if (state.items.length < 2) toast("Only one left. Add more options to spin again.");
  }

  // history strip
  function pushHistory(win) {
    history.unshift({ t: win.t.trim() || "(blank)", c: win.c }); if (history.length > HISTORY_MAX) history.pop();
    renderHistory();
  }
  function renderHistory() {
    el.history.hidden = history.length === 0;
    el.historyChips.innerHTML = "";
    for (const h of history) { const s = document.createElement("span"); s.className = "chip" + (h === history[0] ? " fresh" : ""); s.style.setProperty("--chip-color", PALETTE[h.c % PALETTE.length]); s.textContent = h.t; s.title = h.t; el.historyChips.appendChild(s); }
  }
  el.historyClear.addEventListener("click", () => { history = []; renderHistory(); });

  // ---------- confetti ----------
  let confRaf = 0, parts = [];
  function confetti(mainColor) {
    const cv = el.confetti, x = cv.getContext("2d");
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    parts = [];
    const colors = [mainColor, ...PALETTE];
    for (let i = 0; i < (reduceMotion ? 40 : 160); i++) parts.push({
      x: innerWidth / 2 + (Math.random() - 0.5) * 80, y: innerHeight / 2, vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 12,
      w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 0.3, c: colors[i % colors.length], life: 1,
    });
    let last = performance.now();
    cancelAnimationFrame(confRaf);
    const step = (t) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      x.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const p of parts) {
        p.vy += 22 * dt; p.x += p.vx * 60 * dt * 0.5; p.y += p.vy * 60 * dt * 0.5; p.r += p.vr; p.vx *= 0.995; p.life -= dt * 0.35;
        if (p.life <= 0 || p.y > innerHeight + 20) continue; alive++;
        x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.globalAlpha = Math.min(1, p.life * 2); x.fillStyle = p.c; x.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); x.restore();
      }
      if (alive > 0 && !el.overlay.hidden) confRaf = requestAnimationFrame(step); else x.clearRect(0, 0, innerWidth, innerHeight);
    };
    confRaf = requestAnimationFrame(step);
  }
  function stopConfetti() { cancelAnimationFrame(confRaf); const x = el.confetti.getContext("2d"); x.clearRect(0, 0, el.confetti.width, el.confetti.height); }

  // ---------- options editor ----------
  function renderItems() {
    const cascade = cascadeItems && !reduceMotion; cascadeItems = false;
    el.items.innerHTML = "";
    state.items.forEach((it, i) => {
      const li = document.createElement("li"); li.className = "item";
      const sw = document.createElement("button"); sw.className = "swatch"; sw.type = "button"; sw.style.setProperty("--sw", PALETTE[it.c % PALETTE.length]);
      sw.setAttribute("aria-label", "Change colour"); sw.title = "Change colour";
      sw.addEventListener("click", () => { it.c = (it.c + 1) % PALETTE.length; sw.style.setProperty("--sw", PALETTE[it.c]); changed(); });
      const inp = document.createElement("input"); inp.type = "text"; inp.value = it.t; inp.maxLength = 60; inp.placeholder = "Option " + (i + 1); inp.setAttribute("aria-label", "Option " + (i + 1));
      inp.addEventListener("input", () => { it.t = inp.value; changed(); });
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addItem(i + 1); } if (e.key === "Backspace" && inp.value === "" && state.items.length > 1) { e.preventDefault(); state.items.splice(i, 1); renderItems(); changed(); focusItem(Math.max(0, i - 1)); } });
      const wt = document.createElement("div"); wt.className = "weight";
      const minus = document.createElement("button"); minus.type = "button"; minus.textContent = "−"; minus.setAttribute("aria-label", "Less weight");
      const num = document.createElement("span"); num.textContent = it.w;
      const plus = document.createElement("button"); plus.type = "button"; plus.textContent = "+"; plus.setAttribute("aria-label", "More weight");
      minus.addEventListener("click", () => { it.w = Math.max(1, it.w - 1); num.textContent = it.w; changed(); });
      plus.addEventListener("click", () => { it.w = Math.min(9, it.w + 1); num.textContent = it.w; changed(); });
      wt.append(minus, num, plus); wt.title = "Weight: how many slices this option gets";
      const del = document.createElement("button"); del.className = "del"; del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", "Remove option");
      del.addEventListener("click", () => { li.classList.add("leaving"); setTimeout(() => { const k = state.items.indexOf(it); if (k >= 0) state.items.splice(k, 1); renderItems(); changed(); }, reduceMotion ? 0 : 180); });
      if (cascade) { li.classList.add("appear"); li.style.animationDelay = Math.min(i, 14) * 28 + "ms"; }
      li.append(sw, inp, wt, del); el.items.appendChild(li);
    });
  }
  function focusItem(i) { const inp = el.items.querySelectorAll('input[type="text"]')[i]; if (inp) { inp.focus(); inp.select(); } }
  function addItem(at) {
    if (state.items.length >= MAX_ITEMS) { toast("That's the limit, " + MAX_ITEMS + " options."); return; }
    const used = state.items.map((x) => x.c); let c = 0; for (let k = 0; k < PALETTE.length; k++) if (!used.includes(k)) { c = k; break; } if (used.length >= PALETTE.length) c = state.items.length % PALETTE.length;
    const idx = at == null ? state.items.length : at;
    // avoid two neighbours sharing a colour
    const prev = state.items[idx - 1] || state.items[state.items.length - 1], next = state.items[idx] || state.items[0];
    for (let k = 0; k < PALETTE.length && ((prev && prev.c === c) || (next && next.c === c)); k++) c = (c + 1) % PALETTE.length;
    state.items.splice(idx, 0, { t: "", c, w: 1 }); renderItems(); changed(); focusItem(idx);
    const li = el.items.children[idx]; if (li) li.classList.add("fresh");
  }
  el.addBtn.addEventListener("click", () => addItem());
  el.clearBtn.addEventListener("click", () => { state.items = [{ t: "", c: 0, w: 1 }, { t: "", c: 1, w: 1 }]; cascadeItems = true; renderItems(); changed(); focusItem(0); });
  el.pasteToggle.addEventListener("click", () => { const open = el.pasteBox.hidden; el.pasteBox.hidden = !open; el.pasteToggle.setAttribute("aria-expanded", String(open)); if (open) { el.pasteArea.value = state.items.map((x) => x.t + (x.w > 1 ? " ×" + x.w : "")).join("\n"); el.pasteArea.focus(); } });
  el.pasteApply.addEventListener("click", () => {
    const lines = el.pasteArea.value.split(/\r?\n|,|;/).map((s) => s.trim()).filter(Boolean).slice(0, MAX_ITEMS);
    if (lines.length === 0) { toast("Nothing to use yet."); return; }
    state.items = lines.map((line, i) => { const m = line.match(/^(.*?)\s*[×x\*]\s*(\d)$/i); return { t: (m ? m[1] : line).slice(0, 60), c: i % PALETTE.length, w: m ? clampInt(m[2], 1, 9, 1) : 1 }; });
    el.pasteBox.hidden = true; el.pasteToggle.setAttribute("aria-expanded", "false"); cascadeItems = true; renderItems(); changed();
  });
  el.shuffleBtn.addEventListener("click", () => { for (let i = state.items.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [state.items[i], state.items[j]] = [state.items[j], state.items[i]]; } cascadeItems = true; renderItems(); changed(); });
  el.title.addEventListener("input", () => { state.title = el.title.value; changed(); });

  function changed() {
    lastIdx = -1; revealed = false; glow = null; draw(); syncUrl();
    const ok = canSpin(); el.spinBtn.disabled = !ok || spinning; el.hub.disabled = !ok || spinning; el.emptyHint.hidden = ok;
    el.emptyHint.textContent = state.mode === "teams" ? (state.teams.names.length < 2 ? "Add at least two names in the Teams tab." : "Everyone is placed. Start over to split again.") : "Add at least two options to spin.";
    el.shuffleBtn.hidden = state.mode === "teams";
    el.spinBtn.textContent = state.mode === "teams" ? (state.teams.all ? "Spin and place everyone" : "Spin for the next name") : "Spin";
    document.title = (state.title ? state.title + " · " : "") + "Spin";
    if (activeTab === "share") renderShare();
  }

  // ---------- teams ----------
  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode; lastIdx = -1; history = []; renderHistory();
    changed();
  }
  function renderTeams() {
    const T = state.teams;
    if (document.activeElement !== el.teamNames) el.teamNames.value = T.names.join("\n");
    el.teamsCount.textContent = T.count;
    const ni = nextNameIndex();
    el.teamsNext.textContent = T.names.length === 0 ? "" : ni < 0 ? "All " + T.names.length + " placed" : "Next up: " + T.names[ni];
    const sizes = teamSizes();
    el.teamList.innerHTML = "";
    for (let i = 0; i < T.count; i++) {
      const li = document.createElement("li"); li.className = "team" + (T.names.length && ni >= 0 && !teamOpen(i, sizes) ? " is-full" : ""); li.style.setProperty("--tc", PALETTE[i % PALETTE.length]);
      if (!reduceMotion && (teamsAppear === "all" || teamsAppear === i)) { li.classList.add("appear"); li.style.animationDelay = (teamsAppear === "all" ? 80 + i * 45 : 0) + "ms"; }
      const name = document.createElement("input"); name.type = "text"; name.maxLength = 24; name.value = T.labels[i] || ""; name.placeholder = teamLabel(i); name.setAttribute("aria-label", "Name of team " + (i + 1));
      name.addEventListener("input", () => { T.labels[i] = name.value; changed(); });
      const members = document.createElement("div"); members.className = "members";
      let order = 0;
      T.assigned.forEach((t, k) => { if (t !== i) return; const b = document.createElement("button"); b.type = "button"; b.textContent = T.names[k]; b.title = "Move to the next team";
        if (popFrom >= 0 && !reduceMotion) { b.classList.add("pop"); b.style.animationDelay = (k * 90) + "ms"; }
        else if (k === popOne && !reduceMotion) b.classList.add("pop");
        b.addEventListener("click", () => { T.assigned[k] = (t + 1) % T.count; renderTeams(); changed(); }); members.appendChild(b); });
      const size = document.createElement("div"); size.className = "size"; size.textContent = sizes[i] + (sizes[i] === 1 ? " name" : " names");
      li.append(name, members, size); el.teamList.appendChild(li);
    }
    popFrom = -1; popOne = -1; teamsAppear = null;
    el.modeOne.parentElement.classList.toggle("is-all", !!T.all);
    el.modeOne.classList.toggle("is-on", !T.all); el.modeOne.setAttribute("aria-checked", String(!T.all));
    el.modeAll.classList.toggle("is-on", !!T.all); el.modeAll.setAttribute("aria-checked", String(!!T.all));
  }
  function placeRest() {
    const T = state.teams; const sizes = teamSizes();
    const open = T.assigned.map((t, i) => (t < 0 ? i : -1)).filter((i) => i >= 0);
    for (let i = open.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [open[i], open[j]] = [open[j], open[i]]; }
    for (const k of open) { const cands = []; for (let t = 0; t < T.count; t++) if (teamOpen(t, sizes)) cands.push(t); const t = cands[Math.floor(Math.random() * cands.length)]; T.assigned[k] = t; sizes[t]++; }
  }
  function setNames(lines) {
    const T = state.teams; const old = new Map(T.names.map((n, i) => [n + "#" + i, T.assigned[i]]));
    const seen = {}; T.names = lines.slice(0, 200).map((x) => x.slice(0, 40));
    T.assigned = T.names.map((n) => { const k = n + "#" + (seen[n] = (seen[n] || 0)); seen[n]++; return old.has(k) ? old.get(k) : -1; });
    T.assigned = T.assigned.map((t) => (t >= T.count ? -1 : t));
  }
  let namesTimer = 0;
  el.teamNames.addEventListener("input", () => { clearTimeout(namesTimer); namesTimer = setTimeout(() => { setNames(el.teamNames.value.split(/\r?\n|,|;/).map((x) => x.trim()).filter(Boolean)); renderTeams(); changed(); }, 250); });
  el.teamsMinus.addEventListener("click", () => { const T = state.teams; T.count = Math.max(2, T.count - 1); T.assigned = T.assigned.map((t) => (t >= T.count ? -1 : t)); renderTeams(); changed(); });
  el.teamsPlus.addEventListener("click", () => { const was = state.teams.count; state.teams.count = Math.min(8, was + 1); if (state.teams.count > was) teamsAppear = was; renderTeams(); changed(); });
  function squishSeg() { const g = el.modeOne.parentElement; g.classList.remove("squish"); void g.offsetWidth; g.classList.add("squish"); }
  el.modeOne.addEventListener("click", () => { if (state.teams.all) squishSeg(); state.teams.all = false; renderTeams(); changed(); });
  el.modeAll.addEventListener("click", () => { if (!state.teams.all) squishSeg(); state.teams.all = true; renderTeams(); changed(); });
  el.teamsShuffle.addEventListener("click", () => { const T = state.teams; const pairs = T.names.map((n, i) => [n, T.assigned[i]]); for (let i = pairs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pairs[i], pairs[j]] = [pairs[j], pairs[i]]; } T.names = pairs.map((p) => p[0]); T.assigned = pairs.map((p) => p[1]); renderTeams(); changed(); });
  el.teamsReset.addEventListener("click", () => { state.teams.assigned = state.teams.names.map(() => -1); history = []; renderHistory(); renderTeams(); changed(); });

  // ---------- presets ----------
  PRESETS.forEach((p, pi) => {
    const b = document.createElement("button"); b.className = "preset"; b.type = "button";
    const dots = document.createElement("span"); dots.className = "dots"; p.items.slice(0, 6).forEach((_, i) => { const d = document.createElement("i"); d.style.background = PALETTE[i % PALETTE.length]; dots.appendChild(d); });
    const strong = document.createElement("strong"); strong.textContent = p.name; const small = document.createElement("small"); small.textContent = p.sub;
    b.append(dots, strong, small);
    b.addEventListener("click", () => { state.mode = "wheel"; state.title = p.name; el.title.value = p.name; state.items = p.items.map((t, i) => ({ t, c: i % PALETTE.length, w: 1 })); cascadeItems = true; history = []; renderHistory(); renderItems(); changed(); setTab("options"); toast(p.name + " loaded"); });
    b.style.setProperty("--i", pi); el.presets.appendChild(b);
  });

  // ---------- share ----------
  function renderShare() {
    const url = shareLink(); el.shareUrl.value = url;
    try {
      const q = qrcode(0, "H"); q.addData(url); q.make();
      const n = q.getModuleCount(), cv = el.qr, x = cv.getContext("2d"); const px = 212, s = px / n, pad = 10;
      cv.width = (px + pad * 2) * 2; cv.height = cv.width; x.setTransform(2, 0, 0, 2, 0, 0);
      x.fillStyle = "#fff"; x.fillRect(0, 0, px + pad * 2, px + pad * 2); x.fillStyle = PLUM;
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect(pad + c * s, pad + r * s, s + 0.2, s + 0.2);
      // the logo in the middle (level H leaves room for it)
      const lg = px * 0.2, lx = pad + px / 2 - lg / 2;
      x.fillStyle = "#fff"; roundRect(x, lx - 5, lx - 5, lg + 10, lg + 10, 10); x.fill();
      if (logoImg.complete && logoImg.naturalWidth) x.drawImage(logoImg, lx, lx, lg, lg); else logoImg.onload = () => renderShare();
      cv.hidden = false; el.qrDownload.hidden = false;
    } catch (e) { el.qr.hidden = true; }
    dirtyUrl = false;
  }
  const logoImg = new Image(); logoImg.src = "icon.svg";
  function roundRect(x, px, py, w, h, r) { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); }
  el.qrDownload.addEventListener("click", () => {
    const a = document.createElement("a"); a.download = (state.title ? state.title.replace(/[^\w\-]+/g, "-") : "spin") + "-qr.png"; a.href = el.qr.toDataURL("image/png"); a.click();
  });
  el.copyBtn.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(shareLink()); toast("Link copied"); el.copyBtn.textContent = "Copied"; setTimeout(() => (el.copyBtn.textContent = "Copy"), 1500); }
    catch (e) { el.shareUrl.select(); document.execCommand && document.execCommand("copy"); toast("Link selected, press copy"); }
  });
  if (navigator.share) { el.nativeShare.hidden = false; el.nativeShare.addEventListener("click", () => navigator.share({ title: state.title || "Spin", url: shareLink() }).catch(() => {})); }

  // ---------- saved wheels ----------
  function renderSaved() {
    const list = loadJSON(LS.saved, []);
    el.savedList.innerHTML = ""; el.savedEmpty.hidden = list.length > 0;
    list.forEach((s, si) => {
      const li = document.createElement("li"); li.style.setProperty("--i", Math.min(si, 10));
      const name = document.createElement("div"); name.className = "name"; name.textContent = s.name;
      const meta = document.createElement("span"); meta.className = "meta"; meta.textContent = (s.data.items || []).length + " options · " + new Date(s.at).toLocaleDateString(); name.appendChild(meta);
      const load = document.createElement("button"); load.className = "btn btn-small"; load.textContent = "Load"; load.type = "button";
      load.addEventListener("click", () => { applyState(s.data); history = []; renderHistory(); setTab("options"); toast(s.name + " loaded"); });
      const del = document.createElement("button"); del.className = "del"; del.textContent = "×"; del.type = "button"; del.setAttribute("aria-label", "Delete " + s.name);
      del.addEventListener("click", () => { saveJSON(LS.saved, loadJSON(LS.saved, []).filter((x) => x.id !== s.id)); renderSaved(); });
      li.append(name, load, del); el.savedList.appendChild(li);
    });
  }
  el.saveBtn.addEventListener("click", () => {
    const dflt = state.title || state.items.filter((x) => x.t.trim()).slice(0, 3).map((x) => x.t.trim()).join(", ") || "My wheel";
    const name = prompt("Name for this wheel", dflt); if (name == null) return;
    const list = loadJSON(LS.saved, []); list.unshift({ id: Date.now().toString(36), name: name.trim().slice(0, 48) || dflt, at: Date.now(), data: JSON.parse(JSON.stringify(state)) });
    saveJSON(LS.saved, list.slice(0, 50)); renderSaved(); toast("Saved on this device");
  });

  // ---------- settings ----------
  el.soundSel.addEventListener("change", () => { state.sound = el.soundSel.value; changed(); playWin(); });
  el.removeSel.addEventListener("change", () => { state.remove = el.removeSel.checked; changed(); });
  el.hiddenSel.addEventListener("change", () => { state.hidden = el.hiddenSel.checked; changed(); });
  el.themeSel.addEventListener("change", () => { prefs.theme = el.themeSel.value; applyTheme(); saveJSON(LS.prefs, prefs); });
  el.resetBtn.addEventListener("click", () => { if (!confirm("Start a fresh wheel? The current one stays reachable through its link.")) return; applyState(fresh()); history = []; renderHistory(); setTab("options"); });
  el.muteBtn.addEventListener("click", () => { prefs.muted = !prefs.muted; el.muteBtn.setAttribute("aria-pressed", String(prefs.muted)); el.muteBtn.setAttribute("aria-label", prefs.muted ? "Unmute sounds" : "Mute sounds"); saveJSON(LS.prefs, prefs); if (!prefs.muted) playTick(10); });
  el.themeBtn.addEventListener("click", () => { const dark = isDark(); prefs.theme = dark ? "light" : "dark"; el.themeSel.value = prefs.theme; applyTheme(); saveJSON(LS.prefs, prefs); });
  function popIcon(btn) { btn.classList.remove("popped"); void btn.offsetWidth; btn.classList.add("popped"); }
  [el.muteBtn, el.themeBtn, el.bigBtn].forEach((b) => b.addEventListener("click", () => popIcon(b)));
  function isDark() { const t = document.documentElement.getAttribute("data-theme"); return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; }
  function applyTheme() { if (prefs.theme === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", prefs.theme); }

  // ---------- looks: classic (default), or liquid glass (experimental) ----------
  // In Chromium the glass really bends what is behind it: each pane gets an SVG displacement map of its own size
  // (red = sideways, blue = up and down, grey in the middle = no bending), so only the rim refracts, like a lens.
  const root = document.documentElement;
  const canLens = !!(navigator.userAgentData && navigator.userAgentData.brands && navigator.userAgentData.brands.some((b) => b.brand === "Chromium"));
  const LENSES = [
    { sel: ".bar", blur: 9, edge: 14, scale: 46, sat: 1.8 },
    { sel: ".panel", blur: 9, edge: 20, scale: 60, sat: 1.8 },
    { sel: ".history", blur: 8, edge: 12, scale: 40, sat: 1.8 },
    { sel: ".winner", blur: 14, edge: 22, scale: 70, sat: 1.9 },
    { sel: ".hub", blur: 1.2, edge: 16, scale: 54, sat: 1.5 },
    { sel: "#spinBtn", blur: 5, edge: 10, scale: 34, sat: 1.8 },
    { sel: "#shuffleBtn", blur: 5, edge: 10, scale: 34, sat: 1.8 },
  ];
  let lensSvg = null, lensRO = null;
  function lensMap(w, h, r, edge) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '">' +
      '<defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="#f00"/></linearGradient>' +
      '<linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="#00f"/></linearGradient>' +
      '<filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="' + (edge * 0.45).toFixed(1) + '"/></filter></defs>' +
      '<rect width="' + w + '" height="' + h + '" fill="#000"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#r)"/>' +
      '<rect width="' + w + '" height="' + h + '" rx="' + r + '" fill="url(#b)" style="mix-blend-mode:screen"/>' +
      '<rect x="' + edge + '" y="' + edge + '" width="' + Math.max(1, w - edge * 2) + '" height="' + Math.max(1, h - edge * 2) + '" rx="' + Math.max(0, r - edge) + '" fill="#808080" filter="url(#s)"/></svg>';
    return "data:image/svg+xml," + encodeURIComponent(svg);
  }
  function setLens(el, cfg, i) {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight); if (!w || !h) return;
    const key = w + "x" + h; if (el.dataset.lens === key) return; el.dataset.lens = key;
    const r = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, w / 2, h / 2), edge = Math.min(cfg.edge, w / 2.2, h / 2.2);
    let f = lensSvg.querySelector("#lens-" + i);
    if (!f) { f = document.createElementNS("http://www.w3.org/2000/svg", "filter"); f.id = "lens-" + i; f.setAttribute("color-interpolation-filters", "sRGB"); lensSvg.appendChild(f); }
    f.setAttribute("x", "0"); f.setAttribute("y", "0"); f.setAttribute("width", w); f.setAttribute("height", h); f.setAttribute("filterUnits", "userSpaceOnUse"); f.setAttribute("primitiveUnits", "userSpaceOnUse");
    f.innerHTML = '<feImage href="' + lensMap(w, h, r, edge) + '" x="0" y="0" width="' + w + '" height="' + h + '" preserveAspectRatio="none" result="map"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="map" scale="' + (-cfg.scale) + '" xChannelSelector="R" yChannelSelector="B"/>';
    el.style.backdropFilter = "url(#lens-" + i + ") blur(" + cfg.blur + "px) saturate(" + cfg.sat + ") brightness(1.05)";
  }
  function applyLook() {
    const glass = prefs.look === "glass";   // classic is the default; glass is an experiment you switch on
    if (glass) root.setAttribute("data-look", "glass"); else root.removeAttribute("data-look");
    el.lookSel.value = glass ? "glass" : "classic";
    if (lensRO) { lensRO.disconnect(); lensRO = null; }
    LENSES.forEach((cfg) => { const n = document.querySelector(cfg.sel); if (n) { n.style.backdropFilter = ""; delete n.dataset.lens; } });
    if (glass && canLens) {
      if (!lensSvg) { lensSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); lensSvg.setAttribute("width", "0"); lensSvg.setAttribute("height", "0"); lensSvg.style.position = "absolute"; lensSvg.setAttribute("aria-hidden", "true"); document.body.appendChild(lensSvg); }
      lensRO = new ResizeObserver((entries) => entries.forEach((en) => { const i = LENSES.findIndex((c) => en.target.matches(c.sel)); if (i >= 0) setLens(en.target, LENSES[i], i); }));
      LENSES.forEach((cfg) => { const n = document.querySelector(cfg.sel); if (n) lensRO.observe(n); });
    }
    if (typeof placeGlider === "function") requestAnimationFrame(() => placeGlider(false));
  }
  el.lookSel.addEventListener("change", () => { prefs.look = el.lookSel.value; saveJSON(LS.prefs, prefs); applyLook(); });
  // the highlight on the glass follows the pointer
  let specRaf = 0;
  window.addEventListener("pointermove", (e) => { if (specRaf || root.getAttribute("data-look") !== "glass") return; specRaf = requestAnimationFrame(() => { specRaf = 0; root.style.setProperty("--lx", e.clientX + "px"); root.style.setProperty("--ly", e.clientY + "px"); }); }, { passive: true });

  // big mode
  function setBig(on) {
    document.body.classList.toggle("big", on); el.bigBtn.setAttribute("aria-pressed", String(on));
    if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    setTimeout(resize, 50); setTimeout(resize, 400);
  }
  el.bigBtn.addEventListener("click", () => setBig(!document.body.classList.contains("big")));
  document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("big")) setBig(false); });

  // pull: the big buttons lean toward the pointer and spring back when it leaves
  if (!reduceMotion && matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.querySelectorAll(".btn-primary, .hub, .icon-btn").forEach((b) => {
      const k = b.classList.contains("hub") ? 0.1 : b.classList.contains("icon-btn") ? 0.2 : 0.15;
      b.addEventListener("pointermove", (e) => {
        if (b.disabled) return;
        const r = b.getBoundingClientRect();
        b.classList.add("pulling");
        b.style.setProperty("--mx", ((e.clientX - (r.left + r.width / 2)) * k).toFixed(1) + "px");
        b.style.setProperty("--my", ((e.clientY - (r.top + r.height / 2)) * k).toFixed(1) + "px");
      });
      b.addEventListener("pointerleave", () => { b.classList.remove("pulling"); b.style.setProperty("--mx", "0px"); b.style.setProperty("--my", "0px"); });
    });
  }
  // pull the winner card down to dismiss it; it stretches like rubber and springs back if you let go early
  const card = document.querySelector(".winner"); let pull = null;
  function resetCard() { card.classList.remove("is-pulled"); card.style.transition = ""; card.style.transform = ""; card.style.opacity = ""; card.style.removeProperty("--pull"); }
  card.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; pull = { y: e.clientY, d: 0 }; try { card.setPointerCapture(e.pointerId); } catch (err) {} card.classList.add("is-pulled"); card.style.transition = "none"; });
  card.addEventListener("pointermove", (e) => {
    if (!pull) return;
    const d = e.clientY - pull.y; pull.d = d;
    const y = d > 0 ? d * 0.6 : -Math.pow(-d, 0.7);
    const k = Math.min(1, Math.abs(y) / 140);
    card.style.transform = "translateY(" + y.toFixed(1) + "px) scale(" + (1 - 0.05 * k).toFixed(3) + "," + (1 + 0.05 * k).toFixed(3) + ")";
    card.style.opacity = d > 0 ? String(Math.max(0.45, 1 - d / 420)) : "1";
    card.style.setProperty("--pull", k.toFixed(2));
  });
  function endPull() {
    if (!pull) return; const d = pull.d; pull = null;
    card.classList.remove("is-pulled"); card.style.setProperty("--pull", "0");
    card.style.transition = "transform var(--t-spring) var(--spring), opacity 200ms ease";
    if (d > 110) { card.style.transition = "transform 200ms var(--ease), opacity 200ms ease"; card.style.transform = "translateY(60vh) scale(.9)"; card.style.opacity = "0"; setTimeout(() => { closeWinner(); resetCard(); }, 190); }
    else { card.style.transform = ""; card.style.opacity = ""; }
  }
  card.addEventListener("pointerup", endPull); card.addEventListener("pointercancel", endPull);

  // tabs
  let activeTab = "options";
  function setTab(name) {
    activeTab = name;
    document.querySelectorAll(".tab").forEach((t) => { const on = t.dataset.tab === name; t.classList.toggle("is-active", on); t.setAttribute("aria-selected", String(on)); });
    document.querySelectorAll(".pane").forEach((p) => { const on = p.id === "pane-" + name; p.hidden = !on; p.classList.remove("is-active"); if (on) { void p.offsetWidth; p.classList.add("is-active"); } });
    if (typeof placeGlider === "function") placeGlider(true);
    if (name === "share") renderShare(); if (name === "saved") renderSaved();
    if (name === "teams") { teamsAppear = "all"; renderTeams(); setMode("teams"); } if (name === "options") setMode("wheel");
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));
  // the tab line is liquid: it stretches across both tabs, then shrinks onto the new one
  const tabsEl = document.querySelector(".tabs"); const glider = document.createElement("span"); glider.className = "tab-glider"; tabsEl.appendChild(glider);
  let gliderT = 0;
  function placeGlider(animate) {
    const t = tabsEl.querySelector(".tab.is-active"); if (!t) return;
    const inset = parseFloat(getComputedStyle(tabsEl).getPropertyValue("--glider-inset")); const pad = Number.isFinite(inset) ? inset : 10;
    const L = t.offsetLeft + pad, W = Math.max(8, t.offsetWidth - pad * 2);
    tabsEl.classList.add("has-glider"); clearTimeout(gliderT);
    const curL = parseFloat(glider.style.left), curW = parseFloat(glider.style.width);
    if (!animate || reduceMotion || !(curW > 0)) {
      glider.className = "tab-glider"; glider.style.left = L + "px"; glider.style.width = W + "px";
    } else {
      const uL = Math.min(curL, L), uR = Math.max(curL + curW, L + W);
      glider.className = "tab-glider stretch"; glider.style.left = uL + "px"; glider.style.width = (uR - uL) + "px";
      gliderT = setTimeout(() => { glider.className = "tab-glider settle"; glider.style.left = L + "px"; glider.style.width = W + "px"; }, 120);
    }
    t.scrollIntoView({ block: "nearest", inline: "nearest", behavior: animate && !reduceMotion ? "smooth" : "auto" });
  }
  window.addEventListener("resize", () => placeGlider(false));
  document.fonts && document.fonts.ready.then(() => placeGlider(false));

  // toast
  let toastT = 0;
  function toast(msg) { el.toast.textContent = msg; el.toast.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (el.toast.hidden = true), 2200); }

  // ---------- apply + boot ----------
  function applyState(s) {
    const g = s.teams && Array.isArray(s.teams.names) ? s.teams : freshTeams();
    state = { title: s.title || "", items: (s.items || []).map((it) => ({ t: String(it.t || ""), c: clampInt(it.c, 0, PALETTE.length - 1, 0), w: clampInt(it.w, 1, 9, 1) })), hidden: !!s.hidden, remove: !!s.remove, sound: SOUNDS[s.sound] ? s.sound : "classic",
      mode: s.mode === "teams" ? "teams" : "wheel", teams: { names: g.names.slice(0, 200), count: clampInt(g.count, 2, 8, 2), labels: (g.labels || []).slice(0, 8), assigned: g.names.map((_, i) => clampInt((g.assigned || [])[i], -1, 7, -1)), all: !!g.all } };
    if (state.items.length === 0) state.items = [{ t: "", c: 0, w: 1 }, { t: "", c: 1, w: 1 }];
    el.title.value = state.title; el.soundSel.value = state.sound; el.removeSel.checked = state.remove; el.hiddenSel.checked = state.hidden;
    lastIdx = -1; cascadeItems = true; renderItems(); teamsAppear = "all"; renderTeams(); changed();
    if (state.mode === "teams" && activeTab === "options") setTab("teams");
  }
  function boot() {
    setTimeout(() => document.body.classList.add("ready"), 1400);
    applyTheme(); applyLook(); el.themeSel.value = prefs.theme; el.muteBtn.setAttribute("aria-pressed", String(!!prefs.muted));
    const m = location.hash.match(/#w=([A-Za-z0-9\-_]+)/);
    const fromLink = m && decodeState(m[1]);
    const last = loadJSON(LS.last, null);
    applyState(fromLink || last || fresh());
    if (fromLink && fromLink.title) toast("Opened: " + fromLink.title);
    resize(); renderHistory(); intro = { t0: performance.now(), dur: 700 }; tick(); placeGlider(false);
    new ResizeObserver(resize).observe(el.wrap);
    window.addEventListener("hashchange", () => { const mm = location.hash.match(/#w=([A-Za-z0-9\-_]+)/); const s = mm && decodeState(mm[1]); if (s) applyState(s); });
    if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  boot();

  // a tiny hook for tests
  window.__spin = { get state() { return state; }, spin, encodeState, decodeState, get angle() { return angle; }, slices, indexAt, get spinning() { return spinning || !!windup; }, canLens, shown() { return [...lay.cur.values()]; } };
})();
