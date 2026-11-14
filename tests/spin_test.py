import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8771/index.html"
OUT = pathlib.Path(__file__).resolve().parent / "shots"; OUT.mkdir(exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (" " + str(extra) if extra else ""))
    if not ok: fails.append(name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 1280, "height": 860}, device_scale_factor=1, color_scheme="light")
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("dialog", lambda d: asyncio.ensure_future(d.accept("Test wheel")))
        await pg.goto(URL); await pg.wait_for_timeout(600)
        check("no console errors on load", not errors, errors)
        n = await pg.locator(".item").count(); check("8 preset items rendered", n == 8, n)
        check("spin button enabled", not await pg.locator("#spinBtn").is_disabled())
        await pg.screenshot(path=str(OUT/"01-light.png"))

        # spin by button, wait for stop
        await pg.click("#spinBtn")
        await pg.wait_for_function("window.__spin.spinning === true")
        await pg.wait_for_function("window.__spin.spinning === false", timeout=20000)
        await pg.wait_for_timeout(300)
        check("winner overlay shown", await pg.locator("#overlay").is_visible())
        winner = await pg.text_content("#winnerText")
        expected = await pg.evaluate("(() => { const s=__spin.slices(); return s[__spin.indexAt(__spin.angle, s)].it.t; })()")
        check("winner matches slice under pointer", winner.strip() == expected.strip(), f"{winner!r} vs {expected!r}")
        await pg.screenshot(path=str(OUT/"02-winner.png"))
        chips = await pg.locator(".chip").count(); check("history chip added", chips == 1, chips)
        await pg.click("#closeBtn"); check("overlay closed", await pg.locator("#overlay").is_hidden())

        # link roundtrip
        link = await pg.input_value("#shareUrl")
        st = await pg.evaluate("JSON.stringify(__spin.state)")
        back = await pg.evaluate("(l) => JSON.stringify(__spin.decodeState(l.split('#w=')[1]))", link)
        check("share link round-trips state", json.loads(st) == json.loads(back))
        check("link has hash", "#w=" in link and link.startswith("http://127.0.0.1:8771/"))

        # paste list with weights
        await pg.click("#pasteToggle"); await pg.fill("#pasteArea", "Pizza ×2\nPasta\nSushi *3\nBurger")
        await pg.click("#pasteApply"); await pg.wait_for_timeout(100)
        items = await pg.evaluate("__spin.state.items.map(i=>[i.t,i.w])")
        check("paste list parsed with weights", items == [["Pizza",2],["Pasta",1],["Sushi",3],["Burger",1]], items)
        sl = await pg.evaluate("__spin.slices().length"); check("4 slices", sl == 4, sl)

        # share tab + QR
        await pg.click('[data-tab="share"]'); await pg.wait_for_timeout(200)
        qrdark = await pg.evaluate("(() => { const c=document.getElementById('qr'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let dark=0; for(let i=0;i<d.length;i+=4) if(d[i]<100) dark++; return dark; })()")
        check("QR drawn", qrdark > 2000, qrdark)
        await pg.screenshot(path=str(OUT/"03-share.png"))

        # open the link in a fresh page -> same wheel
        pg2 = await ctx.new_page(); await pg2.goto(await pg.input_value("#shareUrl")); await pg2.wait_for_timeout(400)
        items2 = await pg2.evaluate("__spin.state.items.map(i=>[i.t,i.w])")
        check("fresh page from link shows same wheel", items2 == items, items2)
        await pg2.close()

        # saved
        await pg.click('[data-tab="saved"]'); await pg.click("#saveBtn"); await pg.wait_for_timeout(200)
        saved = await pg.locator("#savedList li").count(); check("saved list has 1", saved == 1, saved)
        name = await pg.text_content("#savedList .name"); check("saved name from prompt", name.startswith("Test wheel"), name)

        # remove winner setting
        await pg.click('[data-tab="settings"]'); await pg.check("#removeSel")
        await pg.click("#spinBtn"); await pg.wait_for_function("window.__spin.spinning === false", timeout=20000); await pg.wait_for_timeout(200)
        cnt = await pg.evaluate("__spin.state.items.length"); check("winner removed after spin", cnt == 3, cnt)
        await pg.click("#closeBtn")

        # hidden labels + dark + phone shots
        await pg.check("#hiddenSel"); await pg.wait_for_timeout(100)
        await pg.click("#themeBtn"); await pg.wait_for_timeout(300)
        check("dark theme applied", await pg.evaluate("document.documentElement.getAttribute('data-theme')") == "dark")
        await pg.click('[data-tab="options"]')
        await pg.screenshot(path=str(OUT/"04-dark.png"))
        # drag fling
        box = await pg.locator("#wheel").bounding_box(); cx, cy = box["x"]+box["width"]/2, box["y"]+box["height"]/2
        await pg.mouse.move(cx+150, cy-100); await pg.mouse.down()
        for i in range(1, 9): await pg.mouse.move(cx+150-i*30, cy-100+i*40); await pg.wait_for_timeout(16)
        await pg.mouse.up()
        flung = await pg.evaluate("__spin.spinning"); check("drag fling starts a spin", flung)
        await pg.wait_for_function("window.__spin.spinning === false", timeout=20000); await pg.wait_for_timeout(200)
        check("fling produced a winner", await pg.locator("#overlay").is_visible())
        await pg.click("#closeBtn")
        # big mode
        await pg.click("#bigBtn"); await pg.wait_for_timeout(500)
        check("big mode hides panel", not await pg.locator(".panel").is_visible())
        await pg.screenshot(path=str(OUT/"05-big.png"))
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(300)
        check("escape leaves big mode", await pg.locator(".panel").is_visible())

        # teams mode
        await pg.click('[data-tab="teams"]'); await pg.wait_for_timeout(100)
        await pg.fill("#teamNames", "Alex\nSam\nMia\nLeo\nZoe\nBen\nKim"); await pg.wait_for_timeout(400)
        await pg.click("#teamsPlus"); await pg.wait_for_timeout(100)
        mode = await pg.evaluate("__spin.state.mode"); check("teams mode on", mode == "teams", mode)
        sl = await pg.evaluate("__spin.slices().length"); check("3 team slices", sl == 3, sl)
        placed = 0
        for i in range(7):
            await pg.click("#spinBtn"); await pg.wait_for_function("window.__spin.spinning === true"); await pg.wait_for_function("window.__spin.spinning === false", timeout=20000); await pg.wait_for_timeout(150)
            placed = await pg.evaluate("__spin.state.teams.assigned.filter(t=>t>=0).length")
            await pg.click("#closeBtn"); await pg.wait_for_timeout(50)
        check("all 7 names placed after 7 spins", placed == 7, placed)
        sizes = await pg.evaluate("(() => { const z=[0,0,0]; __spin.state.teams.assigned.forEach(t=>z[t]++); return z.sort(); })()")
        check("teams balanced 2,2,3", sizes == [2,2,3], sizes)
        check("spin disabled when everyone placed", await pg.locator("#spinBtn").is_disabled())
        chips = await pg.locator("#teamList .members button").count(); check("7 member chips shown", chips == 7, chips)
        link = await pg.input_value("#shareUrl"); pg3 = await ctx.new_page(); await pg3.goto(link); await pg3.wait_for_timeout(500)
        st3 = await pg3.evaluate("JSON.stringify([__spin.state.mode, __spin.state.teams.assigned])"); st1 = await pg.evaluate("JSON.stringify([__spin.state.mode, __spin.state.teams.assigned])")
        check("teams survive the link", st3 == st1, st3)
        await pg3.screenshot(path=str(OUT/"10-teams.png")); await pg3.close()
        await pg.click("#teamsReset"); await pg.click("#splitAll"); await pg.wait_for_timeout(200)
        placed2 = await pg.evaluate("__spin.state.teams.assigned.filter(t=>t>=0).length"); check("split all places everyone", placed2 == 7, placed2)
        await pg.click('[data-tab="options"]'); await pg.wait_for_timeout(100)
        check("options tab returns to wheel mode", await pg.evaluate("__spin.state.mode") == "wheel")

        # phone
        pm = await ctx.new_page(); await pm.set_viewport_size({"width": 390, "height": 844}); await pm.goto(URL); await pm.wait_for_timeout(500)
        sw = await pm.evaluate("document.documentElement.scrollWidth"); check("no horizontal overflow on phone", sw <= 390, sw)
        await pm.screenshot(path=str(OUT/"06-phone.png"), full_page=True)
        check("no console errors overall", not errors, errors)
        await b.close()
    print("\n%d failures" % len(fails)); sys.exit(1 if fails else 0)
asyncio.run(main())
