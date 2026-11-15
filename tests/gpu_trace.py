"""Sums the browser's paint, raster and GPU work during one spin plus the winner card, on a phone-sized page.
Software rendering in headless Chrome, so the numbers are only good for comparing before and after.
  python3 tests/gpu_trace.py [classic|glass]"""
import asyncio, json, sys
from collections import defaultdict
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8771/index.html"
LOOK = sys.argv[1] if len(sys.argv) > 1 else "classic"
DESK = len(sys.argv) > 2 and sys.argv[2] == "desktop"   # python3 tests/gpu_trace.py glass desktop
NAMES = {"RasterTask", "GPUTask", "Paint", "PrePaint", "Layerize", "UpdateLayoutTree", "Layout", "Commit", "ImageDecodeTask", "DrawFrame", "FunctionCall", "FireAnimationFrame"}
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 1280, "height": 860}, device_scale_factor=2) if DESK else await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.add_init_script("try { localStorage.setItem('spin-prefs-v1', JSON.stringify({ muted: true, theme: 'system', look: '%s' })); } catch (e) {}" % LOOK)
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        await b.start_tracing(page=pg, categories=["devtools.timeline", "cc", "gpu", "viz", "disabled-by-default-devtools.timeline"])
        if DESK: await pg.mouse.move(700, 300)
        await pg.wait_for_timeout(2000)                      # idle: should cost nothing
        idle = await b.stop_tracing(); await b.start_tracing(page=pg, categories=["devtools.timeline", "cc", "gpu", "viz", "disabled-by-default-devtools.timeline"])
        if DESK:
            for i in range(30): await pg.mouse.move(300 + i * 25, 200 + (i % 7) * 30); await pg.wait_for_timeout(16)   # the pointer crosses the glass
        await pg.click("#spinBtn"); await pg.wait_for_function("window.__spin.spinning === true"); await pg.wait_for_function("window.__spin.spinning === false", timeout=30000)
        await pg.wait_for_timeout(2500)                      # winner card with confetti
        raw = await b.stop_tracing(); await b.close()
    def gfx_of(blob):
        t = defaultdict(float)
        for e in json.loads(blob)["traceEvents"]:
            if e.get("ph") == "X" and e.get("name") in NAMES: t[e["name"]] += e.get("dur", 0) / 1000
        return sum(t[n] for n in ("RasterTask", "GPUTask", "Paint", "PrePaint", "Layerize", "Commit", "ImageDecodeTask"))
    print("look=%s %s  idle 2 s: graphics work %.0f ms" % (LOOK, "desktop" if DESK else "phone", gfx_of(idle)))
    ev = json.loads(raw)["traceEvents"]; tot = defaultdict(float); cnt = defaultdict(int)
    for e in ev:
        if e.get("ph") == "X" and e.get("name") in NAMES: tot[e["name"]] += e.get("dur", 0) / 1000; cnt[e["name"]] += 1
    gfx = sum(tot[n] for n in ("RasterTask", "GPUTask", "Paint", "PrePaint", "Layerize", "Commit", "ImageDecodeTask"))
    print("look=%s  graphics work %.0f ms  (raster %.0f, gpu %.0f, paint %.0f in %d paints, layerize %.0f)  script %.0f ms" % (
        LOOK, gfx, tot["RasterTask"], tot["GPUTask"], tot["Paint"] + tot["PrePaint"], cnt["Paint"], tot["Layerize"], tot["FunctionCall"] + tot["FireAnimationFrame"]))
asyncio.run(main())
