"""App Store screenshots, second series: the demo account and the 3D badges.

iPhone 6.9" (1320 x 2868). Screens are captures of the demo account Maya
(seed_demo.py), in ./demo. One idea per slide, a different layout each.
Run: python3 build_v2.py  ->  ./v2/0N-*.png
"""
import pathlib
import subprocess

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
DEMO = HERE / 'demo'
BRAND = HERE.parent / 'producthunt' / 'src'
OUT = HERE / 'v2'
OUT.mkdir(exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
W, H = 660, 1434
OUT_W, OUT_H = 1320, 2868

CLOUD = (
    '<svg viewBox="0 0 512 512"><path fill="currentColor" d="M396 432H136c-36.44 0-70.36-12.57-95.51-35.41C14.38 '
    '372.88 0 340 0 304c0-36.58 13.39-68.12 38.72-91.22 18.11-16.53 42.22-28.56 69.18-34.66a15.93 15.93 0 0 0 '
    '11.37-9.49c9.11-21.48 23.51-39.84 42.44-54.23C183.61 95.83 213.16 80 256 80c41.27 0 74.11 14.29 97.75 '
    '42.5 20.42 24.36 30.69 54.38 32.92 76.52a16 16 0 0 0 11.61 13.73C443.26 225.5 512 262.64 512 336c0 '
    '30.61-12.63 57.34-36.51 77.28C452.14 432.6 423.42 432 396 432z"/></svg>'
)
NAVY = '#08243A'
SKY = 'linear-gradient(165deg, #4DC1FF 0%, #8AD3FF 50%, #DDF1FF 100%)'
NIGHT = 'radial-gradient(120% 70% at 50% 45%, #1F5A88 0%, #0B2A45 55%, #061524 100%)'

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
.badge {{ position: absolute; filter: drop-shadow(0 18px 26px rgba(0,0,0,.35)); }}
"""


def clouds(spots, color='#fff'):
    return ''.join(
        f'<div class="cloud" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;opacity:{o};color:{color}">{CLOUD}</div>'
        for x, y, s, o in spots
    )


def phone(screen, left, top, rotate=0, scale=1.0, z=1):
    return (
        f'<div class="phone" style="left:{left}px;top:{top}px;z-index:{z};'
        f'transform:rotate({rotate}deg) scale({scale});transform-origin:center top">'
        f'<img class="frame" src="{BRAND}/mockup.png"><div class="screen"><img src="{DEMO}/{screen}.png"></div></div>'
    )


def chip(left, top, big, small, flag='', rotate=0):
    f = f'<div class="f">{flag}</div>' if flag else ''
    return (f'<div class="chip" style="left:{left}px;top:{top}px;transform:rotate({rotate}deg)">'
            f'{f}<div><b>{big}</b><span>{small}</span></div></div>')


def badge(name, left, top, size, rotate=0, z=6):
    return (f'<img class="badge" src="{DEMO}/badges/{name}.png" '
            f'style="left:{left}px;top:{top}px;width:{size}px;transform:rotate({rotate}deg);z-index:{z}">')


def headline(text, sub, top, size=60, light=False):
    c = 'color:#fff;' if light else ''
    sub_c = 'color:rgba(255,255,255,.75);' if light else ''
    return (f'<div style="position:absolute;left:36px;right:36px;top:{top}px;z-index:8">'
            f'<h1 style="font-size:{size}px;{c}">{text}</h1>'
            f'<p class="sub" style="margin-top:18px;{sub_c}">{sub}</p></div>')


def page(body, css=''):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}{css}</style></head><body>{body}</body></html>'


SLIDES = {
    # 1. The promise: the map, a badge just earned, one number.
    '01-hero': page(
        clouds([(-30, 470, 120, .5), (580, 1060, 90, .4), (-20, 1150, 90, .4)])
        + headline('Your days abroad,<br><em>counted.</em>', 'Visa and tax days, tracked while you travel.', 96, 64)
        + phone('map', 90, 410)
        + f'<img class="badge" src="{DEMO}/badge_coin.png" style="left:430px;top:330px;width:210px;transform:rotate(10deg);z-index:6">'
        + chip(26, 1110, '251 days', 'on the road this year', rotate=-3)
    ),
    # 2. Contrast and the wow: the 3D badges, no phone.
    '02-badges': page(
        clouds([(20, 1240, 150, .05), (500, 120, 160, .05)])
        + headline('Collect <em style="color:#08243A">every</em><br>country', 'A 3D badge for every new country you live in.', 96, 66, light=True)
        + f'<img class="badge" src="{DEMO}/badge_coin.png" style="left:115px;top:470px;width:430px;z-index:5">'
        + badge('vn', 20, 430, 170, -12)
        + badge('es', 470, 410, 165, 10)
        + badge('id', 0, 900, 200, -8)
        + badge('it', 480, 880, 150, 8)
        + badge('pl', 120, 1080, 160, -6)
        + badge('cn', 380, 1100, 170, 6)
        + '<div style="position:absolute;left:0;right:0;top:1310px;text-align:center;z-index:8">'
          '<span style="display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);'
          'color:#fff;border-radius:999px;padding:12px 24px;font-size:22px;font-weight:700">6 of 7 collected</span></div>',
        css=f'body {{ background: {NIGHT}; }}',
    ),
    # 3. The fear, named: the Schengen countdown.
    '03-visa': page(
        clouds([(-30, 520, 120, .5), (570, 1150, 90, .4)])
        + headline('Never overstay<br>in <em>Schengen</em>', '90/180, visa-free days for your passport, and your own visas.', 96, 62)
        + phone('visa', 90, 420, rotate=-3)
        + chip(330, 560, '22 days left', 'Schengen · 68 of 90 used', '🇪🇺', rotate=4)
    ),
    # 4. Phone first, the words below.
    '04-tracking': page(
        clouds([(530, 1250, 130, .5), (-30, 1300, 110, .45)])
        + phone('tracking', 90, -40)
        + '<div style="position:absolute;left:0;right:0;bottom:0;height:520px;'
          'background:linear-gradient(180deg,rgba(221,241,255,0) 0%,rgba(221,241,255,.96) 30%)"></div>'
        + headline('Every stay,<br><em>logged for you</em>', 'No check-ins, no spreadsheet. It just runs.', 1080, 60)
    ),
    # 5. Together: the trip with friends' faces.
    '05-friends': page(
        clouds([(-30, 480, 120, .5), (570, 1120, 90, .4)])
        + headline('Plan trips<br>with <em>friends</em>', 'Invite them, and let them add stops and places to stay.', 96, 64)
        + phone('travellers', 140, 420, rotate=5)
        + chip(22, 820, 'Leo & Sofia', 'joined Japan & Korea', '🇯🇵', rotate=-4)
    ),
    # 6. Two phones: ideas, then where to sleep.
    '06-ideas': page(
        clouds([(-20, 1260, 140, .45), (560, 420, 110, .5)])
        + headline('Your next stop,<br><em>sorted</em>', 'AI ideas for the route, places to stay side by side.', 96, 60)
        + phone('suggestions', -40, 470, rotate=-8, scale=.84)
        + phone('stay', 200, 420, rotate=5, z=2)
        + chip(22, 1170, '2 options', 'for 11 nights in Tokyo', '🇯🇵', rotate=-3)
    ),
    # 7. The tax line, bars in the phone.
    '07-tax': page(
        clouds([(-30, 500, 120, .5), (570, 1150, 90, .4)])
        + headline('See the <em>183-day</em><br>line coming', "Days per country, in each country's own tax year.", 96, 60)
        + phone('tax', 90, 420, rotate=3)
        + chip(320, 470, '123 days left', 'before tax residency', '🇮🇩', rotate=-3)
    ),
}

FEATURES = ['Automatic tracking', 'Schengen 90/180', 'Visa-free days', '183-day tax count',
            '3D country badges', 'Plan with friends', 'AI trip ideas', 'Places to stay',
            'Tickets & documents', 'AI agent API', 'No ads']
SLIDES['08-features'] = page(
    clouds([(20, 80, 140, .5), (500, 200, 120, .5), (40, 1150, 110, .45), (480, 1250, 150, .45)])
    + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 40px">'
    f'<img src="{BRAND}/cloud_n.png" style="width:250px;filter:drop-shadow(0 12px 22px rgba(8,36,58,.25))">'
    '<h1 style="font-size:66px;margin-top:30px">Built for life<br>on the move</h1>'
    '<div style="margin-top:50px;display:flex;flex-wrap:wrap;justify-content:center;gap:16px">'
    + ''.join(f'<span style="background:rgba(255,255,255,.92);border-radius:999px;padding:14px 22px;'
              f'font-size:25px;font-weight:700;box-shadow:0 8px 20px rgba(8,36,58,.10)">{f}</span>' for f in FEATURES)
    + '</div></div>'
)


def render(name, html):
    page_file = OUT / f'{name}.html'
    page_file.write_text(html)
    big = OUT / f'{name}@2x.png'
    subprocess.run(
        [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
         '--allow-file-access-from-files', f'--window-size={W},{H}', f'--screenshot={big}', page_file.as_uri()],
        check=True, capture_output=True,
    )
    # App Store Connect refuses images with an alpha channel.
    Image.open(big).convert('RGB').resize((OUT_W, OUT_H), Image.LANCZOS).save(OUT / f'{name}.png', optimize=True)
    big.unlink()
    page_file.unlink()


for name, html in SLIDES.items():
    render(name, html)
print('done')
