"""App Store screenshots for Nomadu, iPhone 6.9" (1320 x 2868).

Same look as the Product Hunt gallery (sky, clouds, the cloud N), upright.
One idea per slide, the layout changes from slide to slide. The screens
inside the phones are real captures (../producthunt/src/screen-*.png).
Run: python3 build.py  ->  ./0N-*.png
"""
import pathlib
import subprocess

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
SRC = HERE.parent / "producthunt" / "src"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Rendered at half size and doubled: Chrome's window has a size limit, and
# 2x keeps text and screenshots sharp.
W, H = 660, 1434
OUT_W, OUT_H = 1320, 2868

CLOUD = (
    '<svg viewBox="0 0 512 512"><path fill="currentColor" d="M396 432H136c-36.44 0-70.36-12.57-95.51-35.41C14.38 '
    '372.88 0 340 0 304c0-36.58 13.39-68.12 38.72-91.22 18.11-16.53 42.22-28.56 69.18-34.66a15.93 15.93 0 0 0 '
    '11.37-9.49c9.11-21.48 23.51-39.84 42.44-54.23C183.61 95.83 213.16 80 256 80c41.27 0 74.11 14.29 97.75 '
    '42.5 20.42 24.36 30.69 54.38 32.92 76.52a16 16 0 0 0 11.61 13.73C443.26 225.5 512 262.64 512 336c0 '
    '30.61-12.63 57.34-36.51 77.28C452.14 432.6 423.42 432 396 432z"/></svg>'
)
NAVY = "#08243A"
SKY = "linear-gradient(165deg, #4DC1FF 0%, #8AD3FF 50%, #DDF1FF 100%)"
NIGHT = "radial-gradient(120% 80% at 70% 0%, #1B4E78 0%, #0B2A45 50%, #061827 100%)"

BASE = f"""
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: {W}px; height: {H}px; overflow: hidden; }}
body {{ font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: {NAVY};
       background: {SKY}; position: relative; }}
.cloud {{ position: absolute; color: #fff; }}
.cloud svg {{ width: 100%; height: 100%; display: block; }}
h1 {{ font-weight: 800; letter-spacing: -1.6px; line-height: 1.02; text-align: center; }}
h1 em {{ font-style: normal; background: #fff; border-radius: 12px; padding: 0 10px; }}
.sub {{ font-size: 21px; line-height: 1.35; font-weight: 500; color: rgba(8,36,58,.72); text-align: center; }}
.phone {{ position: absolute; width: 480px; height: 978px; filter: drop-shadow(0 26px 40px rgba(8,36,58,.32)); }}
.phone > img.frame {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
.phone .screen {{ position: absolute; left: 5.09%; top: 2.21%; width: 89.82%; height: 95.58%;
                 border-radius: 13.7% / 6.33%; overflow: hidden; background: #fff; }}
.phone .screen img {{ width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }}
.chip {{ position: absolute; background: rgba(255,255,255,.96); border-radius: 22px; padding: 16px 22px;
        box-shadow: 0 16px 34px rgba(8,36,58,.22); display: flex; align-items: center; gap: 12px; z-index: 5; }}
.chip .f {{ font-size: 32px; }}
.chip b {{ font-size: 28px; font-weight: 800; letter-spacing: -0.6px; display: block; }}
.chip span {{ font-size: 16px; font-weight: 600; color: rgba(8,36,58,.62); }}
"""


def clouds(spots, color="#fff"):
    return "".join(
        f'<div class="cloud" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;opacity:{o};color:{color}">{CLOUD}</div>'
        for x, y, s, o in spots
    )


def phone(screen, left, top, rotate=0, scale=1.0, z=1):
    return (
        f'<div class="phone" style="left:{left}px;top:{top}px;z-index:{z};'
        f'transform:rotate({rotate}deg) scale({scale});transform-origin:center top">'
        f'<img class="frame" src="{SRC}/mockup.png"><div class="screen"><img src="{SRC}/screen-{screen}.png"></div></div>'
    )


def chip(left, top, big, small, flag="", rotate=0):
    f = f'<div class="f">{flag}</div>' if flag else ""
    return (f'<div class="chip" style="left:{left}px;top:{top}px;transform:rotate({rotate}deg)">'
            f'{f}<div><b>{big}</b><span>{small}</span></div></div>')


def headline(text, sub, top, size=60, color=None):
    c = f"color:{color};" if color else ""
    sub_c = "color:rgba(255,255,255,.75);" if color else ""
    return (f'<div style="position:absolute;left:40px;right:40px;top:{top}px">'
            f'<h1 style="font-size:{size}px;{c}">{text}</h1>'
            f'<p class="sub" style="margin-top:18px;{sub_c}">{sub}</p></div>')


def page(body, css=""):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}{css}</style></head><body>{body}</body></html>'


SLIDES = {
    # 1. Hero: the promise, the map, one real number.
    "01-hero": page(
        clouds([(-30, 470, 120, .5), (560, 430, 110, .5), (580, 900, 80, .4), (-20, 1000, 90, .4)])
        + headline("Your days abroad,<br><em>counted.</em>", "Visa and tax days, tracked while you travel.", 100, 64)
        + phone("map", 90, 410)
        + chip(30, 1090, "192 days", "away from home this year", rotate=-3)
    ),
    # 2. Contrast: night sky, visa screen, the fear named.
    "02-visa": page(
        clouds([(20, 1250, 140, .06), (520, 380, 160, .06)])
        + headline("Never <em style='color:#08243A'>overstay</em><br>a visa again",
                   "Schengen 90/180, visa-free days for your passport, and your own visas.", 100, 60, "#fff")
        + phone("visa", 90, 420, rotate=-4)
        + chip(360, 560, "81 days left", "United States · ESTA", "🇺🇸", rotate=3),
        css=f"body {{ background: {NIGHT}; }}",
    ),
    # 3. Phone first, words below.
    "03-tax": page(
        clouds([(520, 1250, 130, .5), (-30, 1300, 110, .45)])
        + phone("tax", 90, -40)
        + chip(360, 520, "109 days left", "before tax residency", "🇹🇭", rotate=-2)
        + '<div style="position:absolute;left:0;right:0;bottom:0;height:520px;'
          'background:linear-gradient(180deg,rgba(221,241,255,0) 0%,rgba(221,241,255,.96) 30%)"></div>'
        + headline("See the <em>183-day</em><br>line coming", "Days per country, in each country's own tax year.", 1090, 60)
    ),
    # 4. Tilted, with the stats beside it.
    "04-tracking": page(
        clouds([(-30, 480, 120, .5), (570, 1100, 90, .4)])
        + headline("It logs every stay<br><em>on its own</em>", "No check-ins, no spreadsheet.", 100, 58)
        + phone("tracking", 130, 400, rotate=6)
        + chip(24, 800, "9 countries", "21 cities this year", rotate=-4)
    ),
    # 5. Two phones: the route and the stops.
    "05-plan": page(
        clouds([(-20, 1260, 140, .45), (560, 420, 110, .5)])
        + headline("Plan <em>before</em><br>you book", "Visa days per stop, tickets and places to stay. Plan with friends.", 100, 62)
        + phone("map", -40, 470, rotate=-8, scale=.84)
        + phone("plan", 200, 420, rotate=5, z=2)
        + chip(24, 1170, "180 days", "visa left in Bangkok", "🇹🇭", rotate=-3)
    ),
}

FEATURES = ["Automatic tracking", "Schengen 90/180", "Visa-free days", "183-day tax count",
            "UK, AU, NZ tax years", "Trip planning", "Plan with friends", "Tickets & stays",
            "AI trip ideas", "AI agent API", "No ads"]
SLIDES["06-features"] = page(
    clouds([(20, 80, 140, .5), (500, 200, 120, .5), (40, 1150, 110, .45), (480, 1250, 150, .45)])
    + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 40px">'
    f'<img src="{SRC}/cloud_n.png" style="width:250px;filter:drop-shadow(0 12px 22px rgba(8,36,58,.25))">'
    '<h1 style="font-size:66px;margin-top:30px">Built for life<br>on the move</h1>'
    '<div style="margin-top:50px;display:flex;flex-wrap:wrap;justify-content:center;gap:16px">'
    + "".join(f'<span style="background:rgba(255,255,255,.92);border-radius:999px;padding:14px 22px;'
              f'font-size:25px;font-weight:700;box-shadow:0 8px 20px rgba(8,36,58,.10)">{f}</span>' for f in FEATURES)
    + "</div></div>"
)


def render(name, html):
    page_file = HERE / f"{name}.html"
    page_file.write_text(html)
    big = HERE / f"{name}@2x.png"
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
         "--allow-file-access-from-files", f"--window-size={W},{H}", f"--screenshot={big}", page_file.as_uri()],
        check=True, capture_output=True,
    )
    # App Store Connect refuses images with an alpha channel.
    Image.open(big).convert("RGB").resize((OUT_W, OUT_H), Image.LANCZOS).save(HERE / f"{name}.png", optimize=True)
    big.unlink()
    page_file.unlink()


for name, html in SLIDES.items():
    render(name, html)
print("done")
