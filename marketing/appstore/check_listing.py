"""Check listing.md against App Store Connect's limits and our own rules."""
import pathlib
import re

text = (pathlib.Path(__file__).parent / 'listing.md').read_text()
sections = dict(re.findall(r'^## (.+?) \(\d+\)\n\n(.*?)(?=\n## |\Z)', text, re.S | re.M))
limits = {'App Name': 30, 'Subtitle': 30, 'Keywords': 100, 'Promotional Text': 170,
          'Description': 4000, "What's New in This Version": 4000}
ok = True
for name, limit in limits.items():
    body = sections[name].strip()
    n = len(body)
    flag = 'OK ' if n <= limit else 'TOO LONG'
    ok &= n <= limit
    print(f'{flag} {name}: {n}/{limit}')

title_words = set(re.findall(r'[a-z0-9]+', (sections['App Name'] + ' ' + sections['Subtitle']).lower()))
keywords = sections['Keywords'].strip().split(',')
dupes = [k for k in keywords if k in title_words]
print('keywords repeating name/subtitle:', dupes or 'none')
print('spaces in keywords:', any(' ' in k for k in keywords))
for bad in ['—', '–', 'seamless', 'effortless', 'unlock your', 'game-changer', 'elevate', 'journey like', '!']:
    if bad in text:
        ok = False
        print('found:', repr(bad))
print('all good' if ok and not dupes else 'fix the above')
