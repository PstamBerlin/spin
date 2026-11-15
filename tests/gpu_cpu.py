"""How much processor time the browser's graphics process and the page's own process burn, per situation.
Headless Chrome renders in software, so all compositing work (blur, lens filters, blending) shows up as
CPU time of the gpu-process. Good for comparing before and after a change, not as absolute numbers.
  python3 tests/gpu_cpu.py glass desktop     (look: glass|classic, size: desktop|phone)
Needs the local server: python3 -m http.server 8771 --bind 127.0.0.1 --directory docs"""
import asyncio, subprocess, sys, time
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8771/index.html"
LOOK = sys.argv[1] if len(sys.argv) > 1 else "glass"
DESK = (sys.argv[2] if len(sys.argv) > 2 else "desktop") == "desktop"
def procs(kind):
    out = subprocess.run(["ps", "-Ao", "pid=,command="], capture_output=True, text=True).stdout.splitlines()
    return {int(l.split(None, 1)[0]) for l in out if "--type=" + kind in l and "Google Chrome" in l}
def cpu(pids):
    tot = 0.0
    for pid in pids:
        t = subprocess.run(["ps", "-o", "time=", "-p", str(pid)], capture_output=True, text=True).stdout.strip()
        if not t: continue
        parts = t.split(":"); sec = float(parts[-1]) + 60 * int(parts[-2]) + (3600 * int(parts[-3]) if len(parts) > 2 else 0)
        tot += sec
    return tot
async def main():
    g0, r0 = procs("gpu-process"), procs("renderer")
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 1280, "height": 860}, device_scale_factor=2) if DESK else await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True)
        pg = await ctx.new_page()
        await pg.add_init_script("try { localStorage.setItem('spin-prefs-v1', JSON.stringify({ muted: true, theme: 'system', look: '%s' })); } catch (e) {}" % LOOK)
        await pg.goto(URL); await pg.wait_for_timeout(3000)
        gpu, ren = procs("gpu-process") - g0, procs("renderer") - r0
        rows = []
        async def phase(name, fn):
            a, c, t0 = cpu(gpu), cpu(ren), time.time(); await fn(); dt = time.time() - t0
            rows.append((name, (cpu(gpu) - a) * 1000, (cpu(ren) - c) * 1000, dt))
        async def idle(): await pg.wait_for_timeout(4000)
        async def pointer():
            for i in range(150):
                await pg.mouse.move(120 + (i * 7) % 1040, 120 + (i * 3) % 600) if DESK else None
                await pg.wait_for_timeout(18)
        async def spin():
            await pg.evaluate("document.getElementById('spinBtn').click()"); await pg.wait_for_function("window.__spin.spinning === true"); await pg.wait_for_function("window.__spin.spinning === false", timeout=30000)
        async def winner(): await pg.wait_for_timeout(3200)
        async def tabs():
            await pg.evaluate("document.getElementById('closeBtn').click()"); await pg.wait_for_timeout(300)
            for t in ["teams", "presets", "share", "saved", "settings", "options"]:
                await pg.evaluate("(t) => document.querySelector('[data-tab=' + t + ']').click()", t); await pg.wait_for_timeout(600)
        async def scroll():
            for i in range(24):
                await pg.evaluate("(y) => window.scrollTo(0, y)", (i % 12) * 60 if i < 12 else (11 - i % 12) * 60); await pg.wait_for_timeout(60)
        await phase("idle 4 s", idle)
        if DESK: await phase("pointer moving 3 s", pointer)
        await phase("one spin", spin)
        await phase("winner card 3 s", winner)
        await phase("six tab switches", tabs)
        if not DESK: await phase("scrolling", scroll)
        await b.close()
    print("look=%s %s" % (LOOK, "desktop" if DESK else "phone"))
    for name, g, r, dt in rows: print("  %-20s graphics %6.0f ms   page %6.0f ms   (in %.1f s)" % (name, g, r, dt))
    print("  %-20s graphics %6.0f ms   page %6.0f ms" % ("TOTAL", sum(x[1] for x in rows), sum(x[2] for x in rows)))
asyncio.run(main())
