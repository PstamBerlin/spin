"""Checks the liquid motion layer: tab line stretch-then-shrink, pointer pull, pull-to-dismiss, seg thumb, focus lines."""
import asyncio, pathlib, sys
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8771/index.html"
OUT = pathlib.Path(__file__).resolve().parent / "shots"; OUT.mkdir(exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (" " + str(extra) if extra != "" else ""))
    if not ok: fails.append(name)
GL = "(() => { const g=document.querySelector('.tab-glider'); return [parseFloat(g.style.left), parseFloat(g.style.width), g.getBoundingClientRect().height, g.className]; })()"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        pg = await b.new_page(viewport={"width": 1280, "height": 860})
        errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(URL); await pg.wait_for_timeout(1200)
        spring = await pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--spring')")
        check("spring is a real linear() curve", "linear(" in spring, spring[:30])
        # tab line
        rest = await pg.evaluate(GL)
        tab = await pg.evaluate("(() => { const t=document.querySelector('.tab.is-active'); return [t.offsetLeft, t.offsetWidth]; })()")
        check("line at rest is shorter than its tab", abs(rest[0] - (tab[0] + 10)) < 1 and abs(rest[1] - (tab[1] - 20)) < 1, rest)
        await pg.evaluate("document.querySelector('[data-tab=\"saved\"]').click()")
        mid = await pg.evaluate(GL)
        check("line stretches across both tabs first", mid[1] > rest[1] * 2.5 and "stretch" in mid[3], mid)
        await pg.wait_for_timeout(900)
        end = await pg.evaluate(GL)
        tab2 = await pg.evaluate("(() => { const t=document.querySelector('.tab.is-active'); return [t.offsetLeft, t.offsetWidth]; })()")
        check("then shrinks onto the new tab", abs(end[0] - (tab2[0] + 10)) < 1 and abs(end[1] - (tab2[1] - 20)) < 1 and "settle" in end[3], end)
        await pg.click('[data-tab="options"]'); await pg.wait_for_timeout(900)
        # title line grows on focus
        before = await pg.evaluate("getComputedStyle(document.getElementById('titleInput')).backgroundSize")
        await pg.focus("#titleInput"); await pg.wait_for_timeout(900)
        after = await pg.evaluate("getComputedStyle(document.getElementById('titleInput')).backgroundSize")
        check("title line grows on focus", before.startswith("0%") and after.startswith("100%"), [before, after])
        await pg.evaluate("document.activeElement.blur()"); await pg.wait_for_timeout(900)
        back = await pg.evaluate("getComputedStyle(document.getElementById('titleInput')).backgroundSize")
        check("and shrinks back on blur", back.startswith("0%"), back)
        # pointer pull
        box = await pg.locator("#spinBtn").bounding_box()
        await pg.mouse.move(box["x"] + box["width"] - 6, box["y"] + box["height"] / 2); await pg.wait_for_timeout(200)
        mx = await pg.evaluate("parseFloat(document.getElementById('spinBtn').style.getPropertyValue('--mx'))")
        check("spin button is pulled toward the pointer", mx > 4, mx)
        await pg.mouse.move(10, 400); await pg.wait_for_timeout(100)
        mx0 = await pg.evaluate("document.getElementById('spinBtn').style.getPropertyValue('--mx')")
        check("and lets go when the pointer leaves", mx0 == "0px", mx0)
        # winner card: pull a little = springs back, pull far = dismiss
        await pg.click("#spinBtn"); await pg.wait_for_function("window.__spin.spinning === true"); await pg.wait_for_function("window.__spin.spinning === false", timeout=20000); await pg.wait_for_timeout(900)
        cb = await pg.locator(".winner").bounding_box(); cx, cy = cb["x"] + cb["width"] / 2, cb["y"] + 22
        await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx, cy + 50, steps=5)
        pulled = await pg.evaluate("document.querySelector('.winner').style.transform")
        await pg.screenshot(path=str(OUT / "14-pull.png"))
        await pg.mouse.up(); await pg.wait_for_timeout(900)
        check("card follows a pull", "translateY(30" in pulled, pulled)
        check("short pull springs back, card stays", await pg.locator("#overlay").is_visible() and (await pg.evaluate("document.querySelector('.winner').style.transform")) == "")
        await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx, cy + 200, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(500)
        check("long pull dismisses the card", await pg.locator("#overlay").is_hidden())
        # seg thumb
        await pg.click('[data-tab="teams"]'); await pg.wait_for_timeout(700)
        await pg.click("#modeAll"); await pg.wait_for_timeout(900)
        left = await pg.evaluate("(() => { const s=document.querySelector('.seg'); const b=document.getElementById('modeAll'); return [parseFloat(getComputedStyle(s,'::before').left), b.offsetLeft, s.classList.contains('is-all')]; })()")
        check("seg thumb slid under 'All at once'", left[2] and abs(left[0] - left[1]) < 3, left)
        await pg.screenshot(path=str(OUT / "15-seg.png"))
        check("no page errors", not errors, errors)
        await b.close()
    print("\n%d failures" % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
