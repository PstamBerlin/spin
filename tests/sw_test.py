"""Checks the offline worker: an update shows on the very next load (no stale mix), and the app still opens offline."""
import asyncio, pathlib, shutil, subprocess, sys, tempfile, time
from playwright.async_api import async_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (" " + str(extra) if extra != "" else ""))
    if not ok: fails.append(name)
async def main():
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "stamp.py"), "--check"], capture_output=True, text=True)
    check("docs/ is stamped with its current contents", r.returncode == 0, r.stdout.strip())
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="spin-sw-")); site = tmp / "site"; shutil.copytree(ROOT / "docs", site)
    srv = subprocess.Popen([sys.executable, "-m", "http.server", "8773", "--bind", "127.0.0.1", "--directory", str(site)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(channel="chrome"); ctx = await b.new_context(); pg = await ctx.new_page()
            await pg.goto("http://127.0.0.1:8773/index.html")
            await pg.evaluate("navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready)")
            await pg.wait_for_function("navigator.serviceWorker.controller !== null", timeout=10000)
            await pg.reload(); await pg.wait_for_timeout(500)
            check("page runs under the worker", await pg.evaluate("!!navigator.serviceWorker.controller && !!window.__spin"))
            # ship an "update": the script changes on the server
            js = site / "app.js"; js.write_text(js.read_text().replace("window.__spin = {", "window.__marker = 'new build'; window.__spin = {"))
            subprocess.run([sys.executable, str(ROOT / "tools" / "stamp.py"), str(site)], check=True, stdout=subprocess.DEVNULL)   # a deploy always stamps
            await pg.reload(); await pg.wait_for_timeout(500)
            check("an update shows on the very next load", await pg.evaluate("window.__marker") == "new build")
            # the deploy also brought a new worker: let it finish taking over, then go offline
            before = await pg.evaluate("caches.keys()")
            await pg.evaluate("navigator.serviceWorker.getRegistration().then((r) => r.update())")
            keys = before
            for _ in range(60):
                keys = await pg.evaluate("caches.keys()")
                if len(keys) == 1 and keys != before: break
                await pg.wait_for_timeout(250)
            check("the new worker took over with one fresh offline copy", len(keys) == 1 and keys != before, [before, keys])
            srv.terminate(); srv.wait()
            await pg.reload(); await pg.wait_for_timeout(800)
            ok = await pg.evaluate("!!window.__spin && window.__marker === 'new build' && document.querySelectorAll('.item').length > 0")
            check("opens offline with the latest copy", ok)
            fonts = await pg.evaluate("document.fonts.check('800 16px Unbounded')")
            check("fonts are there offline", fonts)
            await b.close()
    finally:
        if srv.poll() is None: srv.terminate()
        shutil.rmtree(tmp, ignore_errors=True)
    print("\n%d failures" % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
