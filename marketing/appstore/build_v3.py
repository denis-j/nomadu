"""App Store screenshots, third series.

iPhone 6.9" (1320 x 2868). Screens are captures of the demo account Maya
(seed_demo.py) in ./demo; the 3D badges are cut from the app's own badge
screen (./demo/badges3d), flags are the ones the app loads (flagcdn), icons
are the app's Ionicons. One idea per slide, a different layout each; the
flight path runs from the first slide into the second.
Run: python3 build_v3.py  ->  ./v3/0N-*.png
"""
import json
import pathlib
import subprocess

from PIL import Image

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DEMO = HERE / 'demo'
BRAND = HERE.parent / 'producthunt' / 'src'
OUT = HERE / 'v3'
OUT.mkdir(exist_ok=True)
VI = ROOT / 'node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons'
GLYPHS = json.loads((VI / 'glyphmaps/Ionicons.json').read_text())
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
@font-face {{ font-family: Ionicons; src: url('{(VI / 'Fonts/Ionicons.ttf').as_uri()}'); }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
html, body {{ width: {W}px; height: {H}px; overflow: hidden; }}
body {{ font-family: -apple-system, "SF Pro Display", "Helvetica Neue", sans-serif; color: {NAVY};
       background: {SKY}; position: relative; }}
.ic {{ font-family: Ionicons; font-style: normal; font-weight: normal; line-height: 1; }}
.cloud {{ position: absolute; color: #fff; }}
.cloud svg {{ width: 100%; height: 100%; display: block; }}
h1 {{ font-weight: 800; letter-spacing: -1.6px; line-height: 1.12; text-align: center; }}
/* The emphasis is its own box: a background painted on inline text ran
   into the letters of the line above and below. */
h1 em {{ font-style: normal; display: inline-block; background: #fff; border-radius: 14px;
        padding: 0 14px 5px; margin: 5px 2px; line-height: 1.08; }}
.sub {{ font-size: 21px; line-height: 1.35; font-weight: 500; color: rgba(8,36,58,.72); text-align: center; }}
.phone {{ position: absolute; width: 480px; height: 978px; filter: drop-shadow(0 26px 40px rgba(8,36,58,.32)); }}
.phone > img.frame {{ position: absolute; inset: 0; width: 100%; height: 100%; }}
.phone .screen {{ position: absolute; left: 5.09%; top: 2.21%; width: 89.82%; height: 95.58%;
                 border-radius: 13.7% / 6.33%; overflow: hidden; background: #fff; }}
.phone .screen img {{ width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }}
.flag {{ width: 46px; height: 32px; border-radius: 7px; object-fit: cover; box-shadow: 0 0 0 1px rgba(8,36,58,.08); display: block; }}
.icon {{ width: 46px; height: 46px; border-radius: 14px; background: rgba(77,193,255,.18); color: #0A8FD6;
        display: flex; align-items: center; justify-content: center; }}
.chip {{ position: absolute; background: rgba(255,255,255,.97); border-radius: 22px; padding: 16px 22px;
        box-shadow: 0 16px 34px rgba(8,36,58,.22); display: flex; align-items: center; gap: 14px; z-index: 7; }}
.chip b {{ font-size: 28px; font-weight: 800; letter-spacing: -0.6px; display: block; }}
.chip span {{ font-size: 16px; font-weight: 600; color: rgba(8,36,58,.62); }}
.card {{ position: absolute; background: rgba(255,255,255,.97); border-radius: 26px; padding: 20px 22px;
        box-shadow: 0 22px 44px rgba(8,36,58,.24); z-index: 7; }}
.card .row {{ display: flex; align-items: center; gap: 12px; }}
.card .t {{ font-size: 21px; font-weight: 800; letter-spacing: -0.3px; }}
.card .s {{ font-size: 14px; font-weight: 600; color: rgba(8,36,58,.55); margin-top: 2px; }}
.card .pill {{ margin-left: auto; font-size: 13px; font-weight: 700; padding: 5px 11px; border-radius: 999px; }}
.card .bar {{ height: 10px; border-radius: 5px; background: rgba(8,36,58,.08); margin: 16px 0 10px; overflow: hidden; }}
.card .bar i {{ display: block; height: 100%; border-radius: 5px; }}
.card .nums {{ display: flex; justify-content: space-between; font-size: 15px; font-weight: 600; color: rgba(8,36,58,.6); }}
.card .nums b {{ font-weight: 800; }}
.badge {{ position: absolute; filter: drop-shadow(0 18px 26px rgba(0,0,0,.35)); }}
"""


def clouds(spots, color='#fff'):
    return ''.join(
        f'<div class="cloud" style="left:{x}px;top:{y}px;width:{s}px;height:{s}px;opacity:{o};color:{color}">{CLOUD}</div>'
        for x, y, s, o in spots
    )


def ion(name, size=26, color=None):
    c = f'color:{color};' if color else ''
    return f'<i class="ic" style="font-size:{size}px;{c}">&#{GLYPHS[name]};</i>'


def lead(flag=None, icon=None):
    if flag:
        return f'<img class="flag" src="{DEMO}/flags/{flag}.png">'
    if icon:
        return f'<div class="icon">{ion(icon)}</div>'
    return ''


def phone(screen, left, top, rotate=0, scale=1.0, z=1):
    return (
        f'<div class="phone" style="left:{left}px;top:{top}px;z-index:{z};'
        f'transform:rotate({rotate}deg) scale({scale});transform-origin:center top">'
        f'<img class="frame" src="{BRAND}/mockup.png"><div class="screen"><img src="{DEMO}/{screen}.png"></div></div>'
    )


def chip(left, top, big, small, flag=None, icon=None, rotate=0):
    return (f'<div class="chip" style="left:{left}px;top:{top}px;transform:rotate({rotate}deg)">'
            f'{lead(flag, icon)}<div><b>{big}</b><span>{small}</span></div></div>')


def card(left, top, width, flag, title, sub, pill, pill_color, used, total, left_text, bar_color, rotate=0):
    pct = max(4, min(100, round(used / total * 100)))
    return (f'<div class="card" style="left:{left}px;top:{top}px;width:{width}px;transform:rotate({rotate}deg)">'
            f'<div class="row">{lead(flag)}<div><div class="t">{title}</div><div class="s">{sub}</div></div>'
            f'<div class="pill" style="background:{pill_color}22;color:{pill_color}">{pill}</div></div>'
            f'<div class="bar"><i style="width:{pct}%;background:{bar_color}"></i></div>'
            f'<div class="nums"><span><b>{used}</b> of {total} days</span><b style="color:{bar_color}">{left_text}</b></div></div>')


def badge(name, left, top, size, rotate=0, z=6):
    return (f'<img class="badge" src="{DEMO}/badges3d/{name}.png" '
            f'style="left:{left}px;top:{top}px;width:{size}px;transform:rotate({rotate}deg);z-index:{z}">')


def route(path, plane_at=None, plane_rot=0, color='rgba(255,255,255,.9)'):
    """A dashed flight path, as the app draws routes; it leaves slide 1 and enters slide 2."""
    plane = ''
    if plane_at:
        x, y = plane_at
        plane = (f'<div style="position:absolute;left:{x - 22}px;top:{y - 22}px;width:44px;height:44px;border-radius:22px;'
                 f'background:#fff;box-shadow:0 8px 18px rgba(8,36,58,.25);display:flex;align-items:center;justify-content:center;'
                 f'transform:rotate({plane_rot}deg);z-index:3">{ion("airplane", 24, "#0A8FD6")}</div>')
    return (f'<svg style="position:absolute;inset:0;z-index:2" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<path d="{path}" fill="none" stroke="{color}" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/></svg>'
            + plane)


def headline(text, sub, top, size=60, light=False):
    c = 'color:#fff;' if light else ''
    sub_c = 'color:rgba(255,255,255,.75);' if light else ''
    return (f'<div style="position:absolute;left:30px;right:30px;top:{top}px;z-index:8">'
            f'<h1 style="font-size:{size}px;{c}">{text}</h1>'
            f'<p class="sub" style="margin-top:16px;{sub_c}">{sub}</p></div>')


def page(body, css=''):
    return f'<!doctype html><html><head><meta charset="utf-8"><style>{BASE}{css}</style></head><body>{body}</body></html>'


ORANGE, GREEN = '#F2994A', '#34C759'

SLIDES = {
    # 1. The outcome in three words, the map as proof, the two numbers that
    # matter floating over it, and a badge for the fun.
    '01-hero': page(
        clouds([(-40, 1180, 130, .45), (560, 1250, 110, .4)])
        + route('M -20 470 C 160 360, 420 330, 680 420', plane_at=(470, 352), plane_rot=8)
        + headline('Never overstay.<br><em>Anywhere.</em>', 'Your visa and tax days, counted while you travel.', 78, 66)
        + phone('map', 90, 470, scale=.94)
        + card(14, 640, 340, 'eu', 'Schengen Area', '90/180 rolling window', 'Warning', ORANGE, 68, 90, '22 days left', ORANGE, rotate=-3)
        + card(300, 930, 340, 'id', 'Indonesia', 'Tax year 2026', 'Safe', GREEN, 60, 183, '123 days left', GREEN, rotate=3)
        + badge('th', 30, 1150, 200, -10)
    ),
    # 2. The wow, at night: the badges as the app renders them. The flight
    # path from slide 1 arrives here.
    '02-badges': page(
        clouds([(20, 1260, 150, .05), (500, 120, 160, .05)])
        + route('M -20 420 C 120 470, 200 520, 330 520', color='rgba(255,255,255,.35)')
        + headline('Collect <em style="color:#08243A">every</em><br>country', 'A 3D badge for every new country you live in.', 90, 66, light=True)
        + badge('th', 150, 470, 360, 0, z=5)
        + badge('vn', 18, 420, 170, -12)
        + badge('es', 480, 400, 160, 10)
        + badge('id', -10, 880, 220, -6)
        + badge('it', 490, 860, 150, 8)
        + badge('pl', 110, 1090, 190, -5)
        + badge('cn', 380, 1080, 200, 6)
        + '<div style="position:absolute;left:0;right:0;top:1330px;text-align:center;z-index:8">'
          '<span style="display:inline-flex;align-items:center;gap:10px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);'
          f'color:#fff;border-radius:999px;padding:12px 24px;font-size:22px;font-weight:700">{ion("trophy", 22)} 6 of 7 collected</span></div>',
        css=f'body {{ background: {NIGHT}; }}',
    ),
    # 3. The fear, named: the Schengen countdown.
    '03-visa': page(
        clouds([(-30, 540, 120, .5), (570, 1160, 90, .4)])
        + headline('Never overstay<br>in <em>Schengen</em>', '90/180, visa-free days for your passport, and your own visas.', 90, 62)
        + phone('visa', 90, 430, rotate=-3)
        + chip(330, 570, '22 days left', 'Schengen · 68 of 90 used', flag='eu', rotate=4)
    ),
    # 4. Phone first, the words below.
    '04-tracking': page(
        clouds([(530, 1250, 130, .5), (-30, 1300, 110, .45)])
        + phone('tracking', 90, -40)
        + '<div style="position:absolute;left:0;right:0;bottom:0;height:520px;'
          'background:linear-gradient(180deg,rgba(221,241,255,0) 0%,rgba(221,241,255,.96) 30%)"></div>'
        + headline('Every stay,<br><em>logged for you</em>', 'No check-ins, no spreadsheet. It just runs.', 1060, 60)
    ),
    # 5. Together: the trip with the friends' faces.
    '05-friends': page(
        clouds([(-30, 500, 120, .5), (570, 1130, 90, .4)])
        + headline('Plan trips<br>with <em>friends</em>', 'Invite them, and let them add stops and places to stay.', 90, 64)
        + phone('travellers', 140, 430, rotate=5)
        + chip(18, 830, 'Leo & Sofia', 'joined Japan & Korea', icon='people', rotate=-4)
    ),
    # 6. Two phones: ideas for the route, then where to sleep.
    '06-ideas': page(
        clouds([(-20, 1260, 140, .45), (560, 430, 110, .5)])
        + headline('Your next stop,<br><em>sorted</em>', 'AI ideas for the route, places to stay side by side.', 90, 60)
        + phone('suggestions', -40, 480, rotate=-8, scale=.84)
        + phone('stay', 200, 430, rotate=5, z=2)
        + chip(18, 1170, '2 places', 'to compare in Tokyo', icon='bed-outline', rotate=-3)
    ),
    # 7. The tax line.
    '07-tax': page(
        clouds([(-30, 520, 120, .5), (570, 1160, 90, .4)])
        + headline('See the <em>183-day</em><br>line coming', "Days per country, in each country's own tax year.", 90, 60)
        + phone('tax', 90, 430, rotate=3)
        + chip(320, 480, '123 days left', 'before tax residency', flag='id', rotate=-3)
    ),
}

FEATURES = [('location', 'Automatic tracking'), ('shield-checkmark', 'Schengen 90/180'), ('airplane', 'Visa-free days'),
            ('calendar-outline', '183-day tax count'), ('trophy', '3D country badges'), ('people', 'Plan with friends'),
            ('sparkles', 'AI trip ideas'), ('bed-outline', 'Places to stay'), ('document-text-outline', 'Tickets & documents')]
SLIDES['08-features'] = page(
    clouds([(20, 80, 140, .5), (500, 200, 120, .5), (40, 1150, 110, .45), (480, 1250, 150, .45)])
    + '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 34px">'
    f'<img src="{BRAND}/cloud_n.png" style="width:230px;filter:drop-shadow(0 12px 22px rgba(8,36,58,.25))">'
    '<h1 style="font-size:64px;margin-top:26px">Built for life<br>on the move</h1>'
    '<div style="margin-top:44px;display:flex;flex-direction:column;gap:14px;width:100%">'
    + ''.join(f'<div style="display:flex;align-items:center;gap:16px;background:rgba(255,255,255,.92);border-radius:20px;'
              f'padding:12px 18px;box-shadow:0 8px 20px rgba(8,36,58,.08)"><div class="icon">{ion(i)}</div>'
              f'<span style="font-size:24px;font-weight:700">{t}</span></div>' for i, t in FEATURES)
    + '</div></div>'
)


def render(name, html):
    page_file = OUT / f'{name}.html'
    page_file.write_text(html)
    big = OUT / f'{name}@2x.png'
    subprocess.run(
        [CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2',
         '--allow-file-access-from-files', '--virtual-time-budget=3000', f'--window-size={W},{H}',
         f'--screenshot={big}', page_file.as_uri()],
        check=True, capture_output=True,
    )
    # App Store Connect refuses images with an alpha channel.
    Image.open(big).convert('RGB').resize((OUT_W, OUT_H), Image.LANCZOS).save(OUT / f'{name}.png', optimize=True)
    big.unlink()
    page_file.unlink()


for name, html in SLIDES.items():
    render(name, html)
print('done')
