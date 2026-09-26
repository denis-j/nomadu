"""Product Hunt gallery, second series: one layout per slide.

The first series (build.py) was text left, phone right, six times. This one
changes the composition on every slide so each image is worth the swipe.
Run: python3 build_v2.py  -> ../v2/*.png (1270 x 760)
"""
import pathlib
import subprocess

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parent / "v2"
OUT.mkdir(exist_ok=True)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
W, H = 1270, 760

CLOUD = (
    '<svg viewBox="0 0 512 512"><path fill="currentColor" d="M396 432H136c-36.44 0-70.36-12.57-95.51-35.41C14.38 '
    '372.88 0 340 0 304c0-36.58 13.39-68.12 38.72-91.22 18.11-16.53 42.22-28.56 69.18-34.66a15.93 15.93 0 0 0 '
    '11.37-9.49c9.11-21.48 23.51-39.84 42.44-54.23C183.61 95.83 213.16 80 256 80c41.27 0 74.11 14.29 97.75 '
    '42.5 20.42 24.36 30.69 54.38 32.92 76.52a16 16 0 0 0 11.61 13.73C443.26 225.5 512 262.64 512 336c0 '
    '30.61-12.63 57.34-36.51 77.28C452.14 432.6 423.42 432 396 432z"/></svg>'
)

NAVY = "#08243A"
SKY = "linear-gradient(155deg, #4DC1FF 0%, #8AD3FF 52%, #DDF1FF 100%)"
NIGHT = "radial-gradient(120% 90% at 80% 10%, #1B4E78 0%, #0B2A45 45%, #061827 100%)"

BASE = f"""
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: {W}px; height: {H}px; overflow: hidden; }}
body {{ font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: {NAVY};
       background: {SKY}; position: relative; }}
.cloud {{ position: absolute; color: #fff; }}
.cloud svg {{ width: 100%; height: 100%; display: block; }}
h1 {{ font-weight: 800; letter-spacing: -2px; line-height: 1.04; }}
h1 em {{ font-style: normal; background: #fff; border-radius: 14px; padding: 0 14px; margin: 0 -4px; }}
.sub {{ font-size: 24px; line-height: 1.38; font-weight: 500; color: rgba(8,36,58,.74); }}
.phone {{ position: absolute; width: 330px; height: 672px; filter: drop-shadow(0 28px 44px rgba(8,36,58,.30)); }}
.phone > img.frame {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
.phone .screen {{ position: absolute; left: 5.09%; top: 2.21%; width: 89.82%; height: 95.58%;
                 border-radius: 13.7% / 6.33%; overflow: hidden; background: #fff; }}
.phone .screen img {{ width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }}
.card {{ position: absolute; background: rgba(255,255,255,.96); border-radius: 22px; padding: 16px 20px;
        box-shadow: 0 18px 36px rgba(8,36,58,.20); display: flex; align-items: center; gap: 14px; }}
.card .f {{ font-size: 34px; }}
.card b {{ font-size: 28px; font-weight: 800; letter-spacing: -0.6px; display: block; }}
.card span {{ font-size: 16px; font-weight: 600; color: rgba(8,36,58,.62); }}
.logo {{ position: absolute; display: flex; align-items: center; gap: 12px; font-size: 24px; font-weight: 700; }}
.logo img {{ width: 46px; height: 46px; border-radius: 12px; box-shadow: 0 6px 16px rgba(8,36,58,.18); }}
"""


def clouds(spots, color="#fff"):
    return "".join(
        f'<div class="cloud" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;opacity:{o};color:{color}">{CLOUD}</div>'
        for x, y, s, o in spots
    )


def phone(screen, left, top, rotate=0, scale=1.0, z=1):
    return (
        f'<div class="phone" style="left:{left}px;top:{top}px;z-index:{z};'
        f'transform:rotate({rotate}deg) scale({scale});transform-origin:center">'
        f'<img class="frame" src="../src/mockup.png"><div class="screen"><img src="../src/screen-{screen}.png"></div></div>'
    )


def card(left, top, big, small, flag="", rotate=0, z=5):
    f = f'<div class="f">{flag}</div>' if flag else ""
    return (f'<div class="card" style="left:{left}px;top:{top}px;transform:rotate({rotate}deg);z-index:{z}">'
            f'{f}<div><b>{big}</b><span>{small}</span></div></div>')


def logo(left, top, dark=False):
    color = "#fff" if dark else NAVY
    return f'<div class="logo" style="left:{left}px;top:{top}px;color:{color}"><img src="../src/app-icon.png">Nomadu</div>'


def page(body, css=""):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}{css}</style></head><body>{body}</body></html>'


# 1. Hero: centred headline, three phones fanned out and bleeding off the bottom.
HERO = page(
    clouds([(60, 60, 140, .5), (1060, 40, 160, .5), (40, 420, 90, .4), (1140, 380, 90, .4)])
    + '<div style="position:absolute;top:58px;width:100%;text-align:center">'
      '<h1 style="font-size:74px">Your days abroad, <em>counted.</em></h1>'
      '<p class="sub" style="margin-top:18px">Visa days and tax days, tracked while you travel.</p></div>'
    + phone("visa", 250, 330, rotate=-12, scale=.92)
    + phone("map", 470, 270, z=3)
    + phone("tax", 690, 330, rotate=12, scale=.92)
)

# 2. Contrast slide: night sky, one huge number, no phone.
NUMBER = page(
    clouds([(80, 520, 160, .07), (980, 60, 200, .07), (640, 600, 110, .06)])
    + logo(84, 64, dark=True)
    + '<div style="position:absolute;left:84px;top:150px;color:#fff">'
      '<div style="font-size:250px;font-weight:800;letter-spacing:-12px;line-height:.9;'
      'background:linear-gradient(180deg,#FFFFFF 0%,#8AD3FF 100%);-webkit-background-clip:text;color:transparent">192</div>'
      '<div style="font-size:40px;font-weight:800;letter-spacing:-1px;margin-top:8px">days away from home this year.</div>'
      '<div style="font-size:24px;font-weight:500;color:rgba(255,255,255,.72);margin-top:14px;max-width:560px;line-height:1.4">'
      'Nomadu counted every one of them on its own. No check-ins, no spreadsheet.</div></div>'
    + '<div style="position:absolute;right:84px;top:170px;display:flex;flex-direction:column;gap:18px">'
    + "".join(
        f'<div style="background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);border-radius:24px;'
        f'padding:20px 28px;width:300px;color:#fff"><div style="font-size:52px;font-weight:800;letter-spacing:-1.5px">{n}</div>'
        f'<div style="font-size:19px;color:rgba(255,255,255,.66);font-weight:600">{t}</div></div>'
        for n, t in [("9", "countries"), ("21", "cities"), ("32", "stops")]
    )
    + "</div>",
    css=f"body {{ background: {NIGHT}; }}",
)

# 3. Mirrored: phone left, copy right, visa cards floating over the phone's edge.
VISA = page(
    clouds([(1080, 520, 140, .5), (560, 30, 90, .45), (40, 40, 110, .4)])
    + phone("visa", 90, 120, rotate=-5)
    + card(330, 180, "81 days left", "United States · ESTA", "🇺🇸", rotate=-3)
    + card(360, 330, "90 / 180", "Schengen, rolling window", "🇪🇺", rotate=2)
    + card(320, 480, "180 days", "Thailand · DTV", "🇹🇭", rotate=-2)
    + '<div style="position:absolute;left:690px;top:200px;width:520px">'
      '<h1 style="font-size:64px">Never <em>overstay</em><br>a visa again</h1>'
      '<p class="sub" style="margin-top:26px">Schengen, visa-free days for your passport, and the visas you add. '
      'You hear from Nomadu before a stay runs out.</p></div>'
)

# 4. No phone: the tax bars themselves, drawn big, with the 183-day line.
BARS = [("🇹🇭", "Thailand", 74), ("🇨🇳", "China", 23), ("🇲🇽", "Mexico", 18)]
LINE_X, BAR_X, BAR_W = 1050, 330, 720  # 183 days sits at the end of the track
TAX = page(
    clouds([(1040, 40, 150, .5), (30, 600, 120, .45)])
    + logo(84, 64)
    + '<div style="position:absolute;left:84px;top:140px"><h1 style="font-size:66px">See the <em>183-day</em> line coming</h1>'
      '<p class="sub" style="margin-top:16px">Days per country, in each country\'s own tax year.</p></div>'
    + f'<div style="position:absolute;left:{LINE_X}px;top:330px;width:4px;height:330px;background:{NAVY};border-radius:2px"></div>'
    + f'<div style="position:absolute;left:{LINE_X - 60}px;top:292px;width:124px;text-align:center;font-size:20px;font-weight:800">183 days</div>'
    + "".join(
        f'<div style="position:absolute;left:84px;top:{360 + i * 100}px;width:240px;display:flex;align-items:center;gap:14px">'
        f'<span style="font-size:40px">{flag}</span><span style="font-size:28px;font-weight:800">{name}</span></div>'
        f'<div style="position:absolute;left:{BAR_X}px;top:{362 + i * 100}px;width:{BAR_W}px;height:46px;'
        f'background:rgba(255,255,255,.55);border-radius:23px"></div>'
        f'<div style="position:absolute;left:{BAR_X}px;top:{362 + i * 100}px;width:{int(BAR_W * days / 183)}px;height:46px;'
        f'background:linear-gradient(90deg,#34C759,#2FB84F);border-radius:23px;box-shadow:0 8px 20px rgba(52,199,89,.35)"></div>'
        f'<div style="position:absolute;left:{BAR_X + int(BAR_W * days / 183) + 16}px;top:{368 + i * 100}px;'
        f'font-size:26px;font-weight:800">{days}<span style="font-weight:600;color:rgba(8,36,58,.6)"> · {183 - days} left</span></div>'
        for i, (flag, name, days) in enumerate(BARS)
    )
)

# 5. Two phones overlapping and tilted, copy top left.
PLAN = page(
    clouds([(40, 560, 150, .45), (560, 640, 90, .4), (1100, 30, 120, .5)])
    + '<div style="position:absolute;left:84px;top:120px;width:470px">'
      '<h1 style="font-size:74px">Plan<br><em>before</em><br>you book</h1>'
      '<p class="sub" style="margin-top:26px">See the visa days you\'d have left at every stop. '
      'Tickets and hotel options sit right next to the plan.</p></div>'
    + phone("map", 620, 60, rotate=-10, scale=.95, z=1)
    + phone("plan", 860, 110, rotate=6, z=2)
    + card(640, 560, "180 days", "visa left in Bangkok", "🇹🇭", rotate=-4, z=5)
)

# 6. Closer: a tilted mosaic of every screen behind the name.
MOSAIC_SCREENS = ["map", "tracking", "visa", "tax", "plan", "map", "visa", "tracking", "plan", "tax"]
tiles = "".join(
    f'<img src="../src/screen-{s}.png" style="width:190px;border-radius:26px;box-shadow:0 14px 30px rgba(8,36,58,.25)">'
    for s in MOSAIC_SCREENS
)
CLOSER = page(
    '<div style="position:absolute;left:-120px;top:-260px;width:1600px;display:flex;flex-wrap:wrap;gap:26px;'
    f'transform:rotate(-12deg);opacity:.9">{tiles}{tiles}</div>'
    # Sky blue, not pale: the wordmark is white clouds and needs blue behind it.
    '<div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(92,196,255,.98) 0%,'
    'rgba(120,205,255,.94) 46%,rgba(138,211,255,0) 70%)"></div>'
    + '<div style="position:absolute;left:84px;top:170px;width:520px">'
      '<img src="../src/nomadu_cloud_text.png" style="width:430px;filter:drop-shadow(0 10px 18px rgba(8,36,58,.25))">'
      '<h1 style="font-size:52px;margin-top:26px">Built for life<br>on the move</h1>'
      '<p class="sub" style="margin-top:20px">Automatic tracking, visa and tax days, trip plans, '
      'and an API for your AI agent. No ads.</p>'
      '<div style="margin-top:30px;display:inline-block;background:#0B0B0F;color:#fff;border-radius:16px;padding:16px 26px;'
      'font-size:22px;font-weight:700">On the App Store · 14 days free</div></div>'
)

SLIDES = {"01-hero": HERO, "02-number": NUMBER, "03-visa": VISA, "04-tax": TAX, "05-plan": PLAN, "06-closer": CLOSER}


def render(name, html):
    page_file = OUT / f"{name}.html"
    page_file.write_text(html)
    big = OUT / f"{name}@2x.png"
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=2",
         f"--window-size={W},{H}", f"--screenshot={big}", page_file.as_uri()],
        check=True, capture_output=True,
    )
    Image.open(big).convert("RGB").resize((W, H), Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
    big.unlink()
    page_file.unlink()


for name, html in SLIDES.items():
    render(name, html)
print("done")
