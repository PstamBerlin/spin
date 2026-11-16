# The settings added on 17 Nov 2026: spin time, volume, spin slowly, title, message, confetti, glow, remove button,
# click sound, auto close, colour sets and own colours, wheel picture, middle picture and size, contours, shadow,
# page colour and glow. Run with the local server on 8771 (python3 -m http.server 8771 --directory docs).
import asyncio, json, pathlib, time
from playwright.async_api import async_playwright
URL = "http://127.0.0.1:8771/index.html"
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE / "shots"; OUT.mkdir(exist_ok=True)
fails = []
def check(name, ok, extra=""):
    print(("PASS " if ok else "FAIL ") + name + (" " + str(extra) if extra else ""))
    if not ok: fails.append(name)

async def px(pg, fx, fy):
    return await pg.evaluate("""([fx,fy]) => { const c=document.getElementById('wheel'); const d=c.getContext('2d').getImageData(Math.round(c.width*fx),Math.round(c.height*fy),1,1).data; return [d[0],d[1],d[2]]; }""", [fx, fy])

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome")
        ctx = await b.new_context(viewport={"width": 1280, "height": 900}, device_scale_factor=1, color_scheme="light")
        pg = await ctx.new_page(); errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.evaluate("localStorage.clear()"); await pg.goto(URL + "#"); await pg.reload(); await pg.wait_for_timeout(900)
        await pg.click('[data-tab="settings"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(OUT / "s1-settings.png"), full_page=True)

        # spin time
        await pg.evaluate("(()=>{const r=document.getElementById('secsSel'); r.value=3; r.dispatchEvent(new Event('input',{bubbles:true}));})()")
        check("spin time is in the state", await pg.evaluate("__spin.state.secs") == 3)
        # timed inside the page (the test's own clock also counts the time the browser takes to answer)
        took = await pg.evaluate("""() => new Promise((ok) => { document.getElementById('spinBtn').click(); const t0 = performance.now();
          const look = () => { if (!__spin.spinning) ok((performance.now() - t0) / 1000); else requestAnimationFrame(look); }; requestAnimationFrame(look); })""")
        check("a 3 second spin takes about 3 seconds", 2.9 < took < 3.8, round(took, 2))
        winner = (await pg.text_content("#winnerText")).strip()
        expected = await pg.evaluate("(() => { const s=__spin.slices(); return s[__spin.indexAt(__spin.angle, s)].it.t; })()")
        check("winner still matches the slice under the pointer", winner == expected.strip(), [winner, expected])
        check("default card message", (await pg.text_content("#winnerKicker")).strip() == "The wheel says")
        check("remove button shown by default", await pg.locator("#removeAgainBtn").is_visible())
        await pg.click("#closeBtn")

        # message, no confetti, no remove button, auto close
        await pg.fill("#msgSel", "And the winner is")
        for sel in ["#confettiSel", "#removeBtnSel"]: await pg.click(sel + " >> xpath=..")
        await pg.click("#autoCloseSel >> xpath=..")
        st = await pg.evaluate("[__spin.state.msg, __spin.state.confetti, __spin.state.removeBtn, __spin.state.autoClose]")
        check("switches reach the state", st == ["And the winner is", False, False, True], st)
        await pg.click("#spinBtn"); await pg.wait_for_function("window.__spin.spinning === false && !document.getElementById('overlay').hidden", timeout=20000)
        await pg.wait_for_timeout(400)
        check("own card message shown", (await pg.text_content("#winnerKicker")).strip() == "And the winner is")
        check("remove button hidden when switched off", not await pg.locator("#removeAgainBtn").is_visible())
        conf = await pg.evaluate("(()=>{const c=document.getElementById('confetti'); if(!c.width) return 0; const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let n=0; for(let i=3;i<d.length;i+=16) if(d[i]>0) n++; return n;})()")
        check("no confetti when switched off", conf == 0, conf)
        await pg.wait_for_timeout(5200)
        check("card closes by itself after 5 seconds", await pg.locator("#overlay").is_hidden())

        # colour sets
        await pg.select_option("#palSel", "ocean"); await pg.wait_for_timeout(600)
        sw = await pg.evaluate("getComputedStyle(document.querySelector('.item .swatch')).getPropertyValue('--sw').trim().toUpperCase()")
        check("ocean colours on the option swatches", sw == "#03045E", sw)
        await pg.click(".colcell:nth-child(1) .coltog")
        check("a colour can be left out", await pg.evaluate("__spin.state.off") == 1)
        sw2 = await pg.evaluate("getComputedStyle(document.querySelector('.item .swatch')).getPropertyValue('--sw').trim().toUpperCase()")
        check("the left-out colour is no longer used", sw2 == "#0077B6", sw2)
        for i in range(2, 8): await pg.click(f".colcell:nth-child({i}) .coltog")
        check("at least two colours stay on", bin(255 & ~await pg.evaluate("__spin.state.off")).count("1") >= 2, await pg.evaluate("__spin.state.off"))
        await pg.evaluate("(()=>{const i=document.querySelector('.colcell:nth-child(8) input'); i.value='#123456'; i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        st = await pg.evaluate("[__spin.state.pal, __spin.state.cols && __spin.state.cols[7]]")
        check("changing a colour makes it your own set", st == ["custom", "#123456"], st)

        # looks on the page
        for sel in ["#titleSel", "#shadowSel", "#meshSel", "#outlineSel"]: await pg.click(sel + " >> xpath=..")
        check("title hidden", await pg.locator("#titleInput").is_hidden())
        check("wheel shadow off", await pg.evaluate("document.getElementById('wheelWrap').classList.contains('no-shadow')"))
        check("page glow off", await pg.evaluate("getComputedStyle(document.querySelector('.mesh')).display") == "none")
        await pg.evaluate("(()=>{const i=document.getElementById('pageSel'); i.value='#203040'; i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        await pg.wait_for_timeout(600)   # the page colour fades over
        bg = await pg.evaluate("getComputedStyle(document.body).backgroundColor")
        check("page colour", bg == "rgb(32, 48, 64)", bg)

        # link carries the looks; a fresh page shows the same
        link = await pg.input_value("#shareUrl")
        stj = await pg.evaluate("JSON.stringify(__spin.state)")
        back = await pg.evaluate("(l) => JSON.stringify(__spin.decodeState(l.split('#w=')[1]))", link)
        check("share link round-trips every new setting", json.loads(stj) == json.loads(back))
        pg2 = await ctx.new_page(); await pg2.goto(link); await pg2.wait_for_timeout(500)
        s2 = await pg2.evaluate("[__spin.state.secs, __spin.state.msg, __spin.state.pal, __spin.state.cols[7], __spin.state.outline, __spin.state.page]")
        check("fresh page from the link has the same looks", s2 == [3, "And the winner is", "custom", "#123456", True, "#203040"], s2)
        await pg2.close()

        # spin slowly
        await pg.click("#idleSel >> xpath=.."); a1 = await pg.evaluate("__spin.angle"); await pg.wait_for_timeout(1000); a2 = await pg.evaluate("__spin.angle")
        check("spins slowly while waiting", 0.1 < a2 - a1 < 0.5, round(a2 - a1, 3))
        await pg.click("#idleSel >> xpath=..")

        # volume (this device only)
        await pg.evaluate("(()=>{const r=document.getElementById('volSel'); r.value=40; r.dispatchEvent(new Event('input',{bubbles:true}));})()")
        vol = await pg.evaluate("JSON.parse(localStorage.getItem('spin-prefs-v1')).volume")
        check("volume kept on this device", abs(vol - 0.4) < 1e-9, vol)

        # pictures
        await pg.select_option("#palSel", "spin"); await pg.wait_for_timeout(500)
        async with pg.expect_file_chooser() as fc: await pg.click("#hubPicBtn")
        await (await fc.value).set_files(str(HERE / "blue.png")); await pg.wait_for_timeout(500)
        check("picture in the middle", await pg.evaluate("document.getElementById('spinHub').classList.contains('has-pic')"))
        await pg.select_option("#hubSizeSel", "l"); await pg.wait_for_timeout(500)
        ratio = await pg.evaluate("document.getElementById('spinHub').offsetWidth / document.getElementById('wheelWrap').offsetWidth")
        check("large middle is about a third of the wheel", 0.31 < ratio < 0.37, round(ratio, 3))
        async with pg.expect_file_chooser() as fc: await pg.click("#wheelPicBtn")
        await (await fc.value).set_files(str(HERE / "green.png")); await pg.wait_for_timeout(800)
        # several spots, since a slice line or a label can sit on any one of them
        # how much of the wheel's canvas is the green picture (labels, lines and the middle cover the rest)
        share = await pg.evaluate("""(() => { const c=document.getElementById('wheel'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let g=0,n=0; for(let i=0;i<d.length;i+=40){ n++; if(d[i+1]>150&&d[i]<90&&d[i+2]<90) g++; } return g/n; })()""")
        check("one picture across the wheel", share > 0.3, round(share, 3))
        await pg.screenshot(path=str(OUT / "s2-pictures.png"))
        await pg.click("#wheelPicDel"); await pg.wait_for_timeout(400)
        share = await pg.evaluate("""(() => { const c=document.getElementById('wheel'); const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let g=0,n=0; for(let i=0;i<d.length;i+=40){ n++; if(d[i+1]>150&&d[i]<90&&d[i+2]<90) g++; } return g/n; })()""")
        check("back to colours after removing the wheel picture", share < 0.05, round(share, 3))
        await pg.click("#hubPicDel")

        # phone
        pm = await b.new_page(viewport={"width": 390, "height": 844}); await pm.goto(URL); await pm.wait_for_timeout(600)
        await pm.click('[data-tab="settings"]'); await pm.wait_for_timeout(400)
        await pm.screenshot(path=str(OUT / "s3-phone-settings.png"), full_page=True)
        w = await pm.evaluate("document.documentElement.scrollWidth"); check("settings fit a phone", w <= 390, w)
        check("no console errors", not errors, errors)
        await b.close()
    print(f"\n{len(fails)} failures")
asyncio.run(main())
