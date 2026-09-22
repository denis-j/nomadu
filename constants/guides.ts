import type { TransportType } from '../lib/database';

/**
 * The destination guides: what to know before you go, and a route to start
 * from. Handwritten rather than generated, so every line is one somebody
 * would actually pass on; the app's own visa arithmetic fills in the rest
 * on the guide screen.
 *
 * They live here rather than in the screen that shows them because two
 * screens use them now (the list and the guide), and because a guide is
 * content: it grows, the screens do not.
 */

/** A stop of the suggested route: where, for how long, how you get there. */
export interface GuideLeg {
  city: string;
  country: string;
  countryCode: string;
  /** Days from the chosen start date. */
  startOffset: number;
  endOffset: number;
  transport: TransportType;
  latitude: number;
  longitude: number;
}

export interface DestinationGuide {
  id: string;
  /** Emoji, for the places that cannot draw a flag image (native dialogs, trip titles). */
  flag: string;
  countryCode: string;
  country: string;
  tagline: string;
  image: string;
  apps: { name: string; domain: string }[];
  tips: string[];
  legs: GuideLeg[];
}

/** The little square an app is known by, from its domain. */
export const appIconUrl = (domain: string) =>
  `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

/** How long the suggested route runs, in days. */
export function guideDays(guide: DestinationGuide): number {
  if (!guide.legs.length) return 0;
  return Math.max(...guide.legs.map((l) => l.endOffset)) - Math.min(...guide.legs.map((l) => l.startOffset)) + 1;
}

export function guideById(id: string | undefined): DestinationGuide | null {
  return GUIDES.find((g) => g.id === id) ?? null;
}

export const GUIDES: DestinationGuide[] = [
  {
    id: 'thailand',
    flag: '🇹🇭',
    countryCode: 'TH',
    country: 'Thailand',
    tagline: 'Visa on arrival · Nomad-friendly · Beach + jungle',
    image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'Grab', domain: 'grab.com' },
      { name: 'LINE', domain: 'line.me' },
      { name: 'Agoda', domain: 'agoda.com' },
      { name: 'Klook', domain: 'klook.com' },
    ],
    tips: ['SIM at airport (AIS / DTAC)', 'Cash still king outside cities', 'Scooter rental in Chiang Mai'],
    legs: [
      { city: 'Bangkok',     country: 'Thailand', countryCode: 'TH', startOffset: 1,  endOffset: 7,  transport: 'flight', latitude: 13.7563, longitude: 100.5018 },
      { city: 'Chiang Mai',  country: 'Thailand', countryCode: 'TH', startOffset: 9,  endOffset: 14, transport: 'flight', latitude: 18.7883, longitude: 98.9853  },
      { city: 'Koh Samui',   country: 'Thailand', countryCode: 'TH', startOffset: 16, endOffset: 21, transport: 'flight', latitude: 9.5120,  longitude: 100.0136 },
    ],
  },
  {
    id: 'china',
    flag: '🇨🇳',
    countryCode: 'CN',
    country: 'China',
    tagline: 'Install VPN before landing · WeChat everything',
    image: 'https://images.unsplash.com/photo-1547981609-4b6bfe67ca0b?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'ExpressVPN', domain: 'expressvpn.com' },
      { name: 'WeChat', domain: 'wechat.com' },
      { name: 'Alipay', domain: 'alipay.com' },
      { name: 'DiDi', domain: 'didiglobal.com' },
    ],
    tips: ['VPN must be installed before arrival', 'Alipay / WeChat Pay for everything', 'Google Maps offline maps essential'],
    legs: [
      { city: 'Shanghai', country: 'China', countryCode: 'CN', startOffset: 1,  endOffset: 6,  transport: 'flight', latitude: 31.2304, longitude: 121.4737 },
      { city: 'Beijing',  country: 'China', countryCode: 'CN', startOffset: 8,  endOffset: 13, transport: 'train',  latitude: 39.9042, longitude: 116.4074 },
      { city: "Xi'an",    country: 'China', countryCode: 'CN', startOffset: 15, endOffset: 18, transport: 'train',  latitude: 34.3416, longitude: 108.9398 },
    ],
  },
  {
    id: 'japan',
    flag: '🇯🇵',
    countryCode: 'JP',
    country: 'Japan',
    tagline: 'Bullet trains · World-class food · Ultra-fast wifi',
    image: 'https://images.unsplash.com/photo-1492571350019-22de08371fd3?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'Google Maps', domain: 'maps.google.com' },
      { name: 'Google Translate', domain: 'translate.google.com' },
      { name: 'Navitime', domain: 'navitime.co.jp' },
      { name: 'PayPay', domain: 'paypay.ne.jp' },
    ],
    tips: ['Buy Suica IC card at the airport', 'Many restaurants cash only', '7-Eleven ATMs accept foreign cards'],
    legs: [
      { city: 'Tokyo',  country: 'Japan', countryCode: 'JP', startOffset: 1,  endOffset: 7,  transport: 'flight', latitude: 35.6762, longitude: 139.6503 },
      { city: 'Kyoto',  country: 'Japan', countryCode: 'JP', startOffset: 9,  endOffset: 13, transport: 'train',  latitude: 35.0116, longitude: 135.7681 },
      { city: 'Osaka',  country: 'Japan', countryCode: 'JP', startOffset: 15, endOffset: 18, transport: 'train',  latitude: 34.6937, longitude: 135.5023 },
    ],
  },
  {
    id: 'portugal',
    flag: '🇵🇹',
    countryCode: 'PT',
    country: 'Portugal',
    tagline: "Europe's nomad capital · English everywhere",
    image: 'https://images.unsplash.com/photo-1558370781-d6196949e317?auto=format&fit=crop&w=800&q=80',
    apps: [
      { name: 'Bolt', domain: 'bolt.eu' },
      { name: 'Revolut', domain: 'revolut.com' },
      { name: 'Airbnb', domain: 'airbnb.com' },
      { name: 'Wise', domain: 'wise.com' },
    ],
    tips: ['NHR tax regime for new residents', 'Schengen: max 90 / 180 days', 'Fibre wifi standard in Airbnbs'],
    legs: [
      { city: 'Lisbon', country: 'Portugal', countryCode: 'PT', startOffset: 1,  endOffset: 8,  transport: 'flight', latitude: 38.7169, longitude: -9.1399  },
      { city: 'Porto',  country: 'Portugal', countryCode: 'PT', startOffset: 10, endOffset: 14, transport: 'train',  latitude: 41.1579, longitude: -8.6291  },
      { city: 'Algarve', country: 'Portugal', countryCode: 'PT', startOffset: 16, endOffset: 20, transport: 'car',  latitude: 37.0179, longitude: -7.9307  },
    ],
  },
];

