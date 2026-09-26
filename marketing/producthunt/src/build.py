"""Product Hunt gallery (1270 x 760) and thumbnail (240 x 240) for Nomadu.

Each slide is an HTML page rendered by headless Chrome at 2x and scaled
down, so text and screenshots stay sharp. Run: python3 build.py
"""
import pathlib
import subprocess

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1270, 760

# The Ionicons cloud the app draws its sky with (BackgroundClouds.tsx).
CLOUD = (
    '<svg viewBox="0 0 512 512"><path fill="currentColor" d="M396 432H136c-36.44 0-70.36-12.57-95.51-35.41C14.38 '
    '372.88 0 340 0 304c0-36.58 13.39-68.12 38.72-91.22 18.11-16.53 42.22-28.56 69.18-34.66a15.93 15.93 0 0 0 '
    '11.37-9.49c9.11-21.48 23.51-39.84 42.44-54.23C183.61 95.83 213.16 80 256 80c41.27 0 74.11 14.29 97.75 '
    '42.5 20.42 24.36 30.69 54.38 32.92 76.52a16 16 0 0 0 11.61 13.73C443.26 225.5 512 262.64 512 336c0 '
    '30.61-12.63 57.34-36.51 77.28C452.14 432.6 423.42 432 396 432z"/></svg>'
)

CSS = """
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1270px; height: 760px; overflow: hidden; }
body {
  font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif;
  color: #08243A;
  background: linear-gradient(155deg, #4DC1FF 0%, #8AD3FF 52%, #DDF1FF 100%);
  position: relative;
}
.cloud { position: absolute; color: #fff; }
.cloud svg { width: 100%; height: 100%; display: block; }
.brand { position: absolute; left: 84px; top: 70px; display: flex; align-items: center; gap: 14px; }
.brand img { width: 52px; height: 52px; border-radius: 13px; box-shadow: 0 6px 18px rgba(8,36,58,.18); }
.brand span { font-size: 26px; font-weight: 700; letter-spacing: -0.3px; }
.copy { position: absolute; left: 84px; top: 200px; width: 640px; }
h1 { font-size: 72px; line-height: 1.04; font-weight: 800; letter-spacing: -2px; }
h1 em { font-style: normal; background: #fff; border-radius: 14px; padding: 0 14px; margin: 0 -4px;
        box-decoration-break: clone; -webkit-box-decoration-break: clone; }
p.sub { margin-top: 30px; font-size: 25px; line-height: 1.38; color: rgba(8,36,58,.74); font-weight: 500; max-width: 500px; }
.phone { position: absolute; width: 360px; height: 733px; filter: drop-shadow(0 30px 50px rgba(8,36,58,.28)); }
.phone .screen { position: absolute; left: 5.09%; top: 2.21%; width: 89.82%; height: 95.58%;
                 border-radius: 13.7% / 6.33%; overflow: hidden; background: #fff; }
.phone .screen img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
.phone > img.frame { position: absolute; inset: 0; width: 100%; height: 100%; }
.chip { position: absolute; background: rgba(255,255,255,.94); border-radius: 22px; padding: 16px 22px;
        box-shadow: 0 16px 34px rgba(8,36,58,.18); display: flex; align-items: center; gap: 14px; }
.chip b { font-size: 30px; font-weight: 800; letter-spacing: -0.8px; }
.chip span { font-size: 16px; line-height: 1.25; color: rgba(8,36,58,.66); font-weight: 600; }
.flag { font-size: 30px; }
"""


def clouds(spots):
    return "".join(
        f'<div class="cloud" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;opacity:{o}">{CLOUD}</div>'
        for x, y, s, o in spots
    )


def phone(screen, left, top, rotate=0, scale=1.0):
    return (
        f'<div class="phone" style="left:{left}px;top:{top}px;transform:rotate({rotate}deg) scale({scale});'
        f'transform-origin:top center">'
        # The frame's display is opaque black; the screenshot goes on top of it.
        f'<img class="frame" src="mockup.png"><div class="screen"><img src="screen-{screen}.png"></div></div>'
    )


def chip(left, top, big, small, flag=""):
    f = f'<div class="flag">{flag}</div>' if flag else ""
    return f'<div class="chip" style="left:{left}px;top:{top}px">{f}<div><b>{big}</b><br><span>{small}</span></div></div>'


BRAND = '<div class="brand"><img src="app-icon.png"><span>Nomadu</span></div>'
SKY = [(1010, 30, 150, .55), (40, 560, 120, .45), (560, 620, 90, .4), (700, 40, 70, .5)]


def slide(headline, sub, extra, sky=SKY):
    return (
        f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>'
        f"{clouds(sky)}{BRAND}"
        f'<div class="copy"><h1>{headline}</h1><p class="sub">{sub}</p></div>{extra}</body></html>'
    )


SLIDES = {
    "01-hero": slide(
        "Your days abroad,<br><em>counted.</em>",
        "Nomadu tracks where you are and keeps your visa and tax days in check. Automatically.",
        phone("map", 800, 92, rotate=4) + chip(84, 560, "192 days", "away from home<br>this year"),
    ),
    "02-tracking": slide(
        "It logs <em>every</em><br>stay on its own",
        "No check-ins, no spreadsheet. Countries, cities and days add up in the background.",
        phone("tracking", 820, 110) + chip(84, 560, "9 countries", "21 cities in 2026"),
    ),
    "03-visa": slide(
        "Never <em>overstay</em><br>a visa again",
        "Schengen 90/180, visa-free days for your passport, and the visas you add yourself.",
        phone("visa", 820, 110, rotate=-3) + chip(84, 560, "81 days left", "United States, ESTA", "🇺🇸"),
    ),
    "04-tax": slide(
        "See the <em>183-day</em><br>line coming",
        "Days per country, counted in each country's own tax year. UK, Australia and NZ included.",
        phone("tax", 820, 110) + chip(84, 560, "109 days left", "before tax residency<br>in Thailand", "🇹🇭"),
    ),
    "05-plan": slide(
        "Plan <em>before</em><br>you book",
        "Your visa days per stop, with tickets and hotel options right next to the plan.",
        phone("plan", 820, 110, rotate=3) + chip(84, 560, "180 days", "visa left in Thailand", "🇹🇭"),
    ),
}

FEATURES = [
    "Automatic tracking", "Schengen 90/180", "Visa-free days", "183-day tax count",
    "UK, AU, NZ tax years", "Trip planning", "Tickets & stays", "Shared trips",
    "AI agent API", "No ads",
]
CLOSER = (
    f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}'
    ".center { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; }"
    ".center img.n { width: 150px; }"
    ".center h1 { margin-top: 18px; text-align:center; font-size: 60px; }"
    ".pills { margin-top: 38px; width: 1000px; display:flex; flex-wrap:wrap; justify-content:center; gap: 14px; }"
    ".pills span { background: rgba(255,255,255,.9); border-radius: 999px; padding: 13px 24px; font-size: 22px; font-weight: 700;"
    " box-shadow: 0 8px 20px rgba(8,36,58,.10); }"
    ".foot { margin-top: 40px; font-size: 22px; font-weight: 600; color: rgba(8,36,58,.72); }"
    "</style></head><body>"
    f"{clouds([(40, 40, 140, .5), (1060, 90, 120, .5), (120, 590, 100, .4), (1000, 600, 150, .45)])}"
    '<div class="center"><img class="n" src="cloud_n.png"><h1>Built for life on the move</h1>'
    '<div class="pills">' + "".join(f"<span>{f}</span>" for f in FEATURES) + "</div>"
    '<div class="foot">On the App Store · Yearly plan with 14 days free</div></div></body></html>'
)
SLIDES["06-features"] = CLOSER


def render(name, html, w=W, h=H):
    page = HERE / f"{name}.html"
    page.write_text(html)
    big = HERE / f"{name}@2x.png"
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
         f"--window-size={w},{h}", f"--screenshot={big}", page.as_uri()],
        check=True, capture_output=True,
    )
    img = Image.open(big).convert("RGB").resize((w, h), Image.LANCZOS)
    img.save(OUT / f"{name}.png", optimize=True)
    big.unlink()
    page.unlink()


for name, html in SLIDES.items():
    render(name, html)

# Thumbnail: the app icon, as Product Hunt shows it in lists (240 x 240).
Image.open(HERE / "app-icon.png").convert("RGBA").resize((240, 240), Image.LANCZOS).save(OUT / "thumbnail.png")
print("done")
