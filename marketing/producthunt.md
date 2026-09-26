# Product Hunt launch

Status: draft, launch date open.

## Listing

**Name:** Nomadu

**Tagline** (46/60 characters)
Counts your visa and tax days while you travel

**Description** (220/260 characters)
Nomadu records which country and city you're in and keeps the count for you: days left in Schengen, visa-free stays for your passport, days toward tax residency. Plan trips, keep your tickets, or let your AI agent do it.

**Topics:** Travel, iOS, Productivity, Digital Nomad

**Pricing:** Free trial. $9.99/month, $79.99/year with a 14-day free trial, $99.99 lifetime (launch week: $59.99).

**Link:** App Store

## First comment (maker)

I'm Denis, and I live as a digital nomad. I wanted a simple way to keep track of my travels so I wouldn't overstay a visa or run into tax trouble by accident. Everything I tried was either a spreadsheet in disguise or needed me to log every move by hand. None of it looked good or felt good to use.

So I built the app I wanted. Nomadu tracks where you are on its own. You don't have to do anything. From that it shows how many Schengen days you have left, how long you can stay visa-free with your passport, and how close you are to 183 days in a country, counted in each country's own tax year.

I also plan my next trips in it. You see before booking whether a stop pushes you over a limit, and tickets and hotel options live next to the plan. And because I use an AI agent for half my life anyway, Nomadu has an API for it: my agent can check my days or add a stop for me.

No ads, and deleting your account deletes everything. It's on iOS, and for launch week Lifetime is $59.99 instead of $99.99.

What's missing for how you travel?

## Launch offer

Lifetime $59.99 instead of $99.99 for launch week. Set up in App Store Connect: Lifetime product, Pricing, planned price with start and end date. It reverts to $99.99 on its own; the paywall shows the store price automatically.

## Gallery (1270 x 760)

Files in `marketing/producthunt/`, built by `marketing/producthunt/src/build.py` (python3, headless Chrome) from simulator screenshots of the real app.

1. `01-hero.png`: Your days abroad, counted. (map)
2. `02-tracking.png`: It logs every stay on its own (tracking)
3. `03-visa.png`: Never overstay a visa again (visa)
4. `04-tax.png`: See the 183-day line coming (tax residence)
5. `05-plan.png`: Plan before you book (trip plan)
6. `06-features.png`: Built for life on the move (feature list)

Second series in `marketing/producthunt/v2/` (`src/build_v2.py`), one layout per slide:

1. `01-hero.png`: centred headline, three fanned phones
2. `02-number.png`: dark contrast slide, "192 days away from home", no phone
3. `03-visa.png`: mirrored, phone left with floating visa cards
4. `04-tax.png`: the 183-day bars drawn as a chart, no phone
5. `05-plan.png`: two overlapping tilted phones
6. `06-closer.png`: screen mosaic behind the cloud wordmark

Thumbnail: `thumbnail.png`, 240 x 240, the app icon.

## Before launch

- The review on the paywall ("A game-changer for nomads!") must be a real one or go.
- Lifetime launch price scheduled in App Store Connect.
