"""Measures how long one wheel frame takes on a slowed-down phone (CPU throttled 6x, 390x844 at 3x pixels).
Not a pass/fail test: run it before and after a change to compare.  python3 tests/perf_bench.py [look]"""
import asyncio, sys
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8771/index.html"
LOOK = sys.argv[1] if len(sys.argv) > 1 else "classic"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.add_init_script("try { localStorage.setItem('spin-prefs-v1', JSON.stringify({ muted: true, theme: 'system', look: '%s' })); } catch (e) {}" % LOOK)
        cdp = await ctx.new_cdp_session(pg); await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
        await pg.goto(URL); await pg.wait_for_timeout(2500)
        d8 = await pg.evaluate("__spin.bench(120)")
        # a full spin: count frames and the longest gaps
        await pg.evaluate("""() => { window.__f = []; let last = performance.now(); const tick = (t) => { window.__f.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick); }; window.__run = true; requestAnimationFrame(tick); }""")
        await pg.click("#spinBtn"); await pg.wait_for_function("window.__spin.spinning === true"); await pg.wait_for_function("window.__spin.spinning === false", timeout=30000)
        f = await pg.evaluate("(() => { window.__run = false; const a = window.__f.slice(5).sort((x, y) => x - y); return { n: a.length, avg: a.reduce((s, v) => s + v, 0) / a.length, p95: a[Math.floor(a.length * 0.95)], worst: a[a.length - 1], slow: a.filter((v) => v > 25).length }; })()")
        await pg.click("#closeBtn")
        await pg.click('[data-tab="options"]'); await pg.click("#pasteToggle"); await pg.fill("#pasteArea", "\n".join("Option %d" % i for i in range(1, 41))); await pg.click("#pasteApply"); await pg.wait_for_timeout(900)
        d40 = await pg.evaluate("__spin.bench(120)")
        print("look=%s  draw: %.2f ms (8 slices), %.2f ms (40 slices)  |  spin frames: avg %.1f ms, p95 %.1f ms, worst %.1f ms, %d of %d over 25 ms" % (LOOK, d8, d40, f["avg"], f["p95"], f["worst"], f["slow"], f["n"]))
        await b.close()
asyncio.run(main())
