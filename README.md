# Spin

A decision wheel you can fill with anything, spin, and share by link.
Live at spin.peterstam.eu. No accounts, no ads, no server: the whole wheel is packed into the URL.

## How it works

- `docs/` is the whole website. Open `docs/index.html` through any static server.
- The wheel, its options, colours, weights and settings are encoded in the `#w=` part of the link.
- Saved wheels and the sound/theme preferences live in the browser's localStorage only.
- Looks (Settings, The app, Look): **Funfair** is the default (`funfair.css`: awning, tickets, bulbs drawn by the wheel),
  **Funfair glass** is its own liquid glass, and the **Old look** and **Old look, liquid glass** are kept as they were
  (`style.css`, `glass.css`). The look is set on `<html>` as `data-style="funfair"` and/or `data-look="glass"`.
- `sw.js` caches the app so it keeps working offline after the first visit (only on https).

## Test

    python3 -m http.server 8771 --bind 127.0.0.1 --directory docs
    python3 tests/spin_test.py
    python3 tests/motion_test.py
    python3 tests/sw_test.py

Before every deploy: `python3 tools/stamp.py` (versions the file addresses so a new page never runs an old script;
`sw_test.py` fails if it was forgotten).

The test drives a headless Chrome through the wheel: spin, winner, history, link round-trip,
paste list with weights, QR code, saved wheels, remove-winner mode, theme, drag fling, big mode, phone width.

## Credits

Fonts Fredoka and Nunito (SIL Open Font License, see `docs/fonts/OFL.txt`).
QR code library by Kazuhiko Arase (MIT).
