#!/usr/bin/env python3
"""Stamps the site's files with a version, so a new page never runs with an old script.

  python3 tools/stamp.py            stamp docs/
  python3 tools/stamp.py --check    exit 1 if docs/ is not stamped with the current contents
  python3 tools/stamp.py DIR        stamp another copy of the site

Browsers keep scripts and styles for a while and reuse them without asking. index.html therefore
loads app.js?v=<hash of app.js> and so on: when a file changes, its address changes, and the page
and its files always match. sw.js gets a version made from everything, so the offline copy renews too.
"""
import hashlib, pathlib, re, sys
ASSETS = ["style.css", "glass.css", "funfair.css", "qrcode.js", "app.js"]
def stamped(site):
    html = (site / "index.html").read_text(); sw = (site / "sw.js").read_text()
    for a in ASSETS:
        h = hashlib.sha1((site / a).read_bytes()).hexdigest()[:8]
        html, n = re.subn(r'((?:href|src)=")' + re.escape(a) + r'(?:\?v=[0-9a-f]+)?(")', r"\g<1>" + a + "?v=" + h + r"\2", html)
        if n != 1: sys.exit(f"index.html should reference {a} exactly once, found {n}")
    allh = hashlib.sha1(html.encode() + b"".join((site / a).read_bytes() for a in ASSETS)).hexdigest()[:8]
    sw, n = re.subn(r'const VERSION = "[^"]*";', 'const VERSION = "spin-' + allh + '";', sw)
    if n != 1: sys.exit("sw.js should have one VERSION line")
    return html, sw
def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    site = pathlib.Path(args[0]) if args else pathlib.Path(__file__).resolve().parent.parent / "docs"
    html, sw = stamped(site)
    if "--check" in sys.argv:
        ok = html == (site / "index.html").read_text() and sw == (site / "sw.js").read_text()
        print("stamps are current" if ok else "stamps are OUT OF DATE: run python3 tools/stamp.py"); sys.exit(0 if ok else 1)
    (site / "index.html").write_text(html); (site / "sw.js").write_text(sw)
    print("stamped", site)
if __name__ == "__main__":
    main()
