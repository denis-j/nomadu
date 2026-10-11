"""Demo account for the App Store screenshots: one nomad year, a shared trip.

Creates three accounts (Maya, who travels; Leo and Sofia, her friends),
writes Maya's stays, visas and a planned trip straight into Firestore in the
shape the app's sync writes, shares the trip and lets the friends join.
The account ids and the password land in demo_accounts.json (gitignored
scratch, never commit it). Run once: python3 seed_demo.py
"""
import datetime as dt
import json
import pathlib
import re
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
KEY = re.search(r'AIza[0-9A-Za-z_-]{35}', (ROOT / '.env.local').read_text()).group(0)
PROJECT = 'nomady-dcff6'
PASSWORD = 'NomaduDemo2026!'
TODAY = dt.date(2026, 10, 2)
OUT = pathlib.Path(__file__).resolve().parent / 'demo_accounts.json'


def post(url, body, token=None):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        'Content-Type': 'application/json', **({'Authorization': 'Bearer ' + token} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b'{}')


def signup(email, name):
    r = post(f'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={KEY}',
             {'email': email, 'password': PASSWORD, 'returnSecureToken': True})
    post(f'https://identitytoolkit.googleapis.com/v1/accounts:update?key={KEY}',
         {'idToken': r['idToken'], 'displayName': name, 'returnSecureToken': False})
    return r['localId'], r['idToken']


def val(v):
    if v is None:
        return {'nullValue': None}
    if isinstance(v, bool):
        return {'booleanValue': v}
    if isinstance(v, int):
        return {'integerValue': str(v)}
    if isinstance(v, float):
        return {'doubleValue': v}
    if isinstance(v, dt.datetime):
        return {'timestampValue': v.strftime('%Y-%m-%dT%H:%M:%SZ')}
    if isinstance(v, dict):
        return {'mapValue': {'fields': {k: val(x) for k, x in v.items()}}}
    if isinstance(v, list):
        return {'arrayValue': {'values': [val(x) for x in v]}}
    return {'stringValue': str(v)}


def put(path, data, token):
    req = urllib.request.Request(
        f'https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents/{path}',
        data=json.dumps({'fields': {k: val(v) for k, v in data.items()}}).encode(), method='PATCH',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())


def call(fn, data, token):
    return post(f'https://us-central1-{PROJECT}.cloudfunctions.net/{fn}', {'data': data}, token)['result']


NOW = dt.datetime(2026, 10, 2, 8, 0, 0)

# A US passport, so Schengen counts: 55 days this summer plus Lisbon now.
STAYS = [
    ('Mexico City', 'Mexico', 'MX', 19.4326, -99.1332, '2025-10-01', '2025-11-25'),
    ('New York', 'United States', 'US', 40.7128, -74.0060, '2025-11-26', '2026-01-05'),
    ('Bangkok', 'Thailand', 'TH', 13.7563, 100.5018, '2026-01-06', '2026-02-08'),
    ('Chiang Mai', 'Thailand', 'TH', 18.7883, 98.9853, '2026-02-09', '2026-03-05'),
    ('Hanoi', 'Vietnam', 'VN', 21.0278, 105.8342, '2026-03-06', '2026-03-24'),
    ('Hoi An', 'Vietnam', 'VN', 15.8801, 108.3380, '2026-03-25', '2026-04-08'),
    ('Canggu', 'Indonesia', 'ID', -8.6478, 115.1385, '2026-04-09', '2026-06-07'),
    ('Barcelona', 'Spain', 'ES', 41.3874, 2.1686, '2026-06-08', '2026-07-05'),
    ('Florence', 'Italy', 'IT', 43.7696, 11.2558, '2026-07-06', '2026-07-20'),
    ('Kraków', 'Poland', 'PL', 50.0647, 19.9450, '2026-07-21', '2026-08-01'),
    ('London', 'United Kingdom', 'GB', 51.5072, -0.1276, '2026-08-02', '2026-08-31'),
    ('New York', 'United States', 'US', 40.7128, -74.0060, '2026-09-01', '2026-09-19'),
    ('Lisbon', 'Portugal', 'PT', 38.7223, -9.1393, '2026-09-20', None),
]

VISAS = [
    ('TH', 'DTV', '2026-01-01', '2030-12-31', 180, None, None, 'multiple'),
    ('VN', 'E-visa', '2026-03-01', '2026-05-30', 90, None, None, 'single'),
    ('ID', 'B211A', '2026-04-01', '2026-06-30', 60, None, None, 'single'),
]

TRIP = ('Japan & Korea', [
    ('Tokyo', 'Japan', 'JP', 35.6762, 139.6503, '2026-11-10', '2026-11-20', 'flight'),
    ('Kyoto', 'Japan', 'JP', 35.0116, 135.7681, '2026-11-21', '2026-11-28', 'train'),
    ('Osaka', 'Japan', 'JP', 34.6937, 135.5023, '2026-11-29', '2026-12-03', 'train'),
    ('Seoul', 'South Korea', 'KR', 37.5665, 126.9780, '2026-12-04', '2026-12-15', 'flight'),
])


def days(a, b):
    end = dt.date.fromisoformat(b) if b else TODAY
    return (end - dt.date.fromisoformat(a)).days + 1


def main():
    if OUT.exists():
        raise SystemExit('demo_accounts.json exists; the demo is already seeded.')
    stamp = NOW.strftime('%Y%m%d%H%M')
    people = {}
    for key, name, avatar in [('maya', 'Maya', 'nomadu-maya'), ('leo', 'Leo', 'nomadu-leo'), ('sofia', 'Sofia', 'nomadu-sofia')]:
        uid, token = signup(f'appstore-{key}-{stamp}@example.com', name)
        people[key] = {'uid': uid, 'token': token, 'email': f'appstore-{key}-{stamp}@example.com', 'name': name}
        put(f'users/{uid}', {
            'displayName': name, 'avatar': avatar,
            'citizenship': {'country': 'United States', 'countryCode': 'US'},
            'hasFixedResidence': False, 'timezone': 'Europe/Lisbon', 'createdAt': NOW,
        }, token)

    maya = people['maya']
    for i, (city, country, cc, lat, lon, a, b) in enumerate(STAYS):
        put(f"users/{maya['uid']}/trips/{uuid.uuid4()}", {
            'city': city, 'country': country, 'country_code': cc, 'latitude': lat, 'longitude': lon,
            'start_date': a, 'end_date': b, 'days': days(a, b), 'local_id': i + 1, 'install_id': 'appstore-demo',
            'updated_at': NOW, 'synced_at': NOW, 'deleted': False,
        }, maya['token'])
    for i, (cc, label, a, b, per_stay, per_window, window, entries) in enumerate(VISAS):
        put(f"users/{maya['uid']}/visas/{uuid.uuid4()}", {
            'country_code': cc, 'label': label, 'valid_from': a, 'valid_to': b,
            'max_days_per_stay': per_stay, 'max_days_per_window': per_window, 'window_days': window,
            'entries_allowed': entries, 'notes': None, 'local_id': i + 1, 'install_id': 'appstore-demo',
            'updated_at': NOW, 'synced_at': NOW, 'deleted': False,
        }, maya['token'])

    title, stops = TRIP
    jid = str(uuid.uuid4())
    legs = [{
        'sync_id': str(uuid.uuid4()), 'city': c, 'country': co, 'country_code': cc, 'latitude': la, 'longitude': lo,
        'start_date': a, 'end_date': b, 'transport': t, 'notes': None, 'sort_order': i,
    } for i, (c, co, cc, la, lo, a, b, t) in enumerate(stops)]
    put(f"users/{maya['uid']}/journeys/{jid}", {
        'title': title, 'legs': legs,
        'travellers': [{'sync_id': str(uuid.uuid4()), 'name': 'You', 'sort_order': 0, 'uid': None, 'avatar': 'nomadu-maya'}],
        'updated_at': NOW, 'deleted': False, 'local_id': 1, 'synced_at': NOW,
    }, maya['token'])

    tokyo = legs[0]
    put(f"users/{maya['uid']}/accommodations/{tokyo['sync_id']}", {
        'journey_id': jid, 'stop_id': tokyo['sync_id'], 'needed': True, 'status': 'options_available',
        'check_in': tokyo['start_date'], 'check_out': '2026-11-21',
        'requirements': {'budget_per_night': 140, 'currency': 'USD', 'notes': 'Fast Wi-Fi, a desk, near a station'},
        'options': [
            {'id': str(uuid.uuid4()), 'name': 'Shibuya Loft Studio', 'platform': 'Airbnb', 'url': None, 'address': 'Shibuya, Tokyo',
             'check_in': tokyo['start_date'], 'check_out': '2026-11-21', 'total_price': 1290, 'price_per_night': 117.27,
             'currency': 'USD', 'fees': None, 'rating': 4.92, 'rating_scale': 5, 'review_count': 214,
             'cancellation_policy': 'Free until Nov 3', 'amenities': ['Wi-Fi', 'Desk', 'Washer'], 'score': 9,
             'risks': None, 'notes': None, 'last_checked_at': None, 'sort_order': 0},
            {'id': str(uuid.uuid4()), 'name': 'Hotel Gracery Shinjuku', 'platform': 'Booking.com', 'url': None, 'address': 'Shinjuku, Tokyo',
             'check_in': tokyo['start_date'], 'check_out': '2026-11-21', 'total_price': 1480, 'price_per_night': 134.55,
             'currency': 'USD', 'fees': None, 'rating': 8.6, 'rating_scale': 10, 'review_count': 5120,
             'cancellation_policy': 'Free until Nov 8', 'amenities': ['Wi-Fi', 'Breakfast'], 'score': 8,
             'risks': None, 'notes': None, 'last_checked_at': None, 'sort_order': 1},
        ],
        'selected_option_id': None, 'booking': None, 'notes': None, 'local_id': 1,
        'updated_at': NOW, 'synced_at': NOW, 'deleted': False,
    }, maya['token'])

    code = call('shareJourney', {'journeyId': jid, 'name': 'Maya'}, maya['token'])['code']
    for key in ('leo', 'sofia'):
        call('joinJourney', {'code': code, 'name': people[key]['name']}, people[key]['token'])
    call('setJourneyMemberCanEdit', {'journeyId': jid, 'memberUid': people['leo']['uid'], 'canEdit': True}, maya['token'])

    OUT.write_text(json.dumps({
        'password': PASSWORD, 'journey_id': jid,
        'people': {k: {x: v[x] for x in ('uid', 'email', 'name')} for k, v in people.items()},
    }, indent=2))
    print('seeded', maya['email'])


if __name__ == '__main__':
    main()
