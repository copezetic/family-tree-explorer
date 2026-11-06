#!/usr/bin/env python3
"""Build family/tree.js for the Family Tree channel from an Ancestry GEDCOM export.

usage: python3 gedcom_to_tree.py sample/sample.ged Alex > tree.js

If the root has a spouse in the tree, her ancestors are walked too and written as TREE.spouse.

It walks the root person's ancestors (father = HUSB, mother = WIFE of the FAMC family), keeps only those, and
lists each ancestor's brothers and sisters, and
protects the living: anyone with no death record who was born after 1925 (or has no birth year) shows a name
and birth year only, no dates or places. Media files are not in GEDCOM exports; their titles are listed so the
pictures can be downloaded from Ancestry by hand.
"""
import json, re, sys, math, collections

path = sys.argv[1]
root_hint = sys.argv[2] if len(sys.argv) > 2 else 'Alex'
lines = open(path, encoding='utf-8-sig').read().splitlines()
recs, stack = {}, []
for ln in lines:
    m = re.match(r'^(\d+) (@[^@]+@ )?(\S+)(?: (.*))?$', ln)
    if not m: continue
    lvl, xref, tag, val = int(m.group(1)), (m.group(2) or '').strip(), m.group(3), m.group(4) or ''
    node = {'tag': tag, 'val': val, 'kids': []}
    if lvl == 0: recs[xref or tag] = node; stack = [node]
    else: stack = stack[:lvl]; stack[-1]['kids'].append(node); stack.append(node)
kid = lambda n, t: [k for k in n['kids'] if k['tag'] == t]
def v(n, *path):
    for t in path:
        k = kid(n, t) if n else []
        n = k[0] if k else None
    return n['val'] if n else ''

def year(d):
    m = re.findall(r'\b(1[0-9]{3}|20[0-2][0-9])\b', d or '')
    return int(m[0]) if m else None
MONTHS = {'fév': 'Feb', 'déc': 'Dec', 'janv': 'Jan', 'avr': 'Apr', 'mai': 'May', 'juin': 'Jun', 'juil': 'Jul', 'août': 'Aug', 'sept': 'Sep', 'oct': 'Oct', 'nov': 'Nov', 'mars': 'Mar'}
MON3 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
def norm_style(d):
    # one house style: "4 Jan 1902", not "04 JAN 1902", "January 4, 1902", "Jan. 4" or "AFT 1780"
    d = re.sub(r'\b(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b', lambda m: m.group(1).title(), d)
    d = re.sub(r'\b(AFT|BEF)\b', lambda m: m.group(1).lower(), d)
    m = re.match(r'^([A-Z][a-z]+)\.? (\d{1,2}), (\d{4})$', d)
    if m and m.group(1)[:3] in MON3: d = f"{int(m.group(2))} {m.group(1)[:3]} {m.group(3)}"
    d = re.sub(r'\b(' + '|'.join(MON3) + r')\.(?= )', r'\1', d)
    return re.sub(r'^0(\d) ', r'\1 ', d)
def tidy_date(d):
    d = (d or '').strip()
    for a, b in MONTHS.items(): d = re.sub(r'\b' + a + r'\b', b, d, flags=re.I)
    d = re.sub(r'\b(?:ABT|Abt|abt)\b\.?', 'c.', d)
    d = re.sub(r'\bage\b', '', d).strip()
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{4})$', d)
    if m:   # month/day/year, unless the first number can't be a month (28/09/1883 is day-first)
        mo, dy = (int(m.group(1)), int(m.group(2))) if int(m.group(1)) <= 12 else (int(m.group(2)), int(m.group(1)))
        d = f"{dy} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][mo-1]} {m.group(3)}"
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', d)
    if m: d = f"{int(m.group(3))} {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][int(m.group(2))-1]} {m.group(1)}"
    d = norm_style(d)
    return re.sub(r'\s+', ' ', d.replace(',', ', ')).replace(' ,', ',').strip(' ,')
PLACE_FIX = {   # garbled or wrong-county places from the GEDCOM
    'Combe, St Nicholas, shire': 'Combe St Nicholas, Somerset, England',
    'Habana, Ciego de Avila, Cuba': 'Havana, Cuba',
    'Cotheridge, Wiltshire, England': 'Cotheridge, Worcestershire, England',
    'Guilford, Fairfield, Connecticut': 'Guilford, New Haven, Connecticut',
    'Beverly, Middlesex, Province of Massachusetts Bay': 'Beverly, Essex, Province of Massachusetts Bay',
    'Barcley, Dunkerton': 'Barclay, Black Hawk, Iowa',
    'Stundweiller, Alsace, France': 'Stundwiller, Bas-Rhin, France',
    'Waywayanda, New York': 'Wawayanda, Orange, New York',
    'Clarkston Washington': 'Clarkston, Washington',
    'South Kingston Rhode Island': 'South Kingstown, Rhode Island',
    'South Kingston Washington Rhode Island': 'South Kingstown, Washington, Rhode Island',
    'St. Louis Missouri': 'St. Louis, Missouri',
    'Saranac, NY': 'Saranac, New York',
    'Hartford, CT': 'Hartford, Connecticut',
    'Roxbury, Mass': 'Roxbury, Massachusetts',
    'Weybridge, VT': 'Weybridge, Vermont',
    'Dighton, Bristol Co. MA': 'Dighton, Bristol, Massachusetts',
    'Orange Co, NY': 'Orange County, New York',
    'Dolsentown, Orange Co, NY': 'Dolsentown, Orange, New York',
    'Ida Grove, Ida, IA': 'Ida Grove, Ida, Iowa',
    'Northampton, PA': 'Northampton, Pennsylvania',
    'Nicholson, Luzerne Co., Pa': 'Nicholson, Luzerne, Pennsylvania',
    'Bangor, N Y': 'Bangor, New York',
    'Kings Run McKean County, PA': 'Kings Run, McKean, Pennsylvania',
    'Anne Arundel Medical Hospital, Annapolis Md': 'Anne Arundel Medical Hospital, Annapolis, Maryland',
    'Cambridge Brighton, MA, Massachusetts': 'Brighton, Cambridge, Massachusetts',
    'West Haven, New Haven Co., Connecticut': 'West Haven, New Haven, Connecticut',
    'Milton Twp., Northumberland Co., Pennsylvania': 'Milton Township, Northumberland, Pennsylvania',
    'Milton, Turbot Twp., Northumberland Co.': 'Milton, Turbot Township, Northumberland',
    'Paradise Twp., Lancaster Co., Pennsylvania': 'Paradise Township, Lancaster, Pennsylvania',
    'Barclay Twp, Black Hawk, Iowa': 'Barclay Township, Black Hawk, Iowa',
    'Newark Essex, New Jersey': 'Newark, Essex, New Jersey',
    'Baden-Württemberg, Baden Wurttemberg, Allemagne': 'Baden-Württemberg, Germany',
    'Bavaria / Bayern': 'Bavaria, Germany',
}
def tidy_place(p):
    parts = [x.strip() for x in (p or '').split(',') if x.strip()]
    parts = [x for x in parts if x not in ('United States', 'USA', 'US', 'United States of America')]
    fix = {'Broadwinsor': 'Broadwindsor', 'Switzwerland': 'Switzerland', 'Ft Covington': 'Fort Covington', 'Huntington': 'Huntingdon'}
    parts = [fix.get(x, x) for x in parts]
    out = []
    for x in parts:
        if x not in out: out.append(x)
    p = ', '.join(out[:3]).rstrip('.')
    return PLACE_FIX.get(p, p)

people, fams = {}, {}
for x, n in recs.items():
    if n['tag'] == 'INDI':
        nm = kid(n, 'NAME')
        ev = lambda t: {'date': tidy_date(v(n, t, 'DATE')), 'place': tidy_place(v(n, t, 'PLAC'))} if kid(n, t) else None
        # one Ancestry name carries a pasted javascript:void(0)
        people[x] = {'name': re.sub(r'\s+', ' ', nm[0]['val'].replace('/', '').replace('javascript:void(0)', ' ')).strip() if nm else '?',
                     'surname': v(n, 'NAME', 'SURN'),
                     'sex': v(n, 'SEX'), 'birth': ev('BIRT'), 'death': ev('DEAT'), 'burial': ev('BURI'),
                     'famc': [k['val'] for k in kid(n, 'FAMC')], 'fams': [k['val'] for k in kid(n, 'FAMS')],
                     'media': [k['val'] for k in kid(n, 'OBJE')]}
    elif n['tag'] == 'FAM':
        fams[x] = {'husb': v(n, 'HUSB'), 'wife': v(n, 'WIFE'), 'chil': [k['val'] for k in kid(n, 'CHIL')],
                   'marr': {'date': tidy_date(v(n, 'MARR', 'DATE')), 'place': tidy_place(v(n, 'MARR', 'PLAC'))} if kid(n, 'MARR') else None}
media = {}
for x, n in recs.items():
    if n['tag'] == 'OBJE':
        media[x] = v(n, 'FILE', 'TITL') or v(n, 'TITL')

cands = [x for x, p in people.items() if root_hint in p['name'] and p['birth'] and year(p['birth']['date']) and year(p['birth']['date']) > 1960]
root = sorted(cands, key=lambda x: -year(people[x]['birth']['date']))[0]
# Ancestry trees often hold the same person twice (one copy linked to a spouse, one to parents). When an
# ancestor has no parents, borrow them from a twin: same first name, surname and birth year.
def key(p):
    g = p['name'].split()
    return (g[0].lower() if g else '', (p['surname'] or '').lower(), year((p['birth'] or {}).get('date')))
twins = collections.defaultdict(list)
for x, p in people.items(): twins[key(p)].append(x)
merged = []
for x, p in people.items():
    if not p['famc'] and key(p)[2]:
        for y in twins[key(p)]:
            if y != x and people[y]['famc']:
                p['famc'] = people[y]['famc']; p['media'] += people[y]['media']
                if not p['death'] and people[y]['death']: p['death'] = people[y]['death']
                if (not p['birth'] or not p['birth']['place']) and people[y]['birth']: p['birth'] = people[y]['birth']
                merged.append(p['name']); break
def pedigree(start):
    ped, q = {1: start}, [1]
    while q:
        k = q.pop(0); p = people[ped[k]]
        if not p['famc']: continue
        # a father and a mother added from different records can sit in two one-parent families; take the first of each
        fs = [fams.get(x, {}) for x in p['famc']]
        f = {'husb': next((x.get('husb') for x in fs if x.get('husb')), None), 'wife': next((x.get('wife') for x in fs if x.get('wife')), None)}
        for kk, y in ((2 * k, f.get('husb')), (2 * k + 1, f.get('wife'))):
            if y and y in people and y not in ped.values(): ped[kk] = y; q.append(kk)
    return ped
ped = pedigree(root)
# the root's spouse : her own ancestors, numbered the same way from her (1 = her)
spouse = None
for f in people[root]['fams']:
    fm = fams.get(f) or {}
    other = fm.get('wife') if fm.get('husb') == root else fm.get('husb')
    if other and other in people: spouse = (other, fm); break

def living(p):
    by = year((p['birth'] or {}).get('date'))
    # a child born before 1940: certainly not living, whatever the birth year says
    kids = [year((people[c]['birth'] or {}).get('date')) for f in p['fams'] for c in (fams.get(f) or {}).get('chil', []) if c in people]
    if any(k and k < 1940 for k in kids): return False
    return not p['death'] and (by is None or by > 1925)
def siblings(x):
    # brothers and sisters from every family the person is a child in; the living show a name and birth year only
    out, seen = [], {x}
    for f in people[x]['famc']:
        for c in (fams.get(f) or {}).get('chil', []):
            if c not in people or c in seen: continue
            seen.add(c); q = people[c]; lv = living(q)
            by = year((q['birth'] or {}).get('date')); dy = year((q['death'] or {}).get('date'))
            s = {'name': q['name'], 'sex': q['sex'], 'living': lv,
                 'years': (f'b. {by}' if lv else f"{by or '?'}–{dy or '?'}") if (by or dy) else ''}
            if (s['name'], s['years']) not in {(o['name'], o['years']) for o in out}: out.append(s)
    out.sort(key=lambda s: int((re.search(r'\d{4}', s['years']) or [9999])[0]))
    return out
def card(k, ped=None):
    ped = ped or PED
    x = ped[k]; p = people[x]; by = year((p['birth'] or {}).get('date')); dy = year((p['death'] or {}).get('date'))
    live = living(p)
    c = {'k': k, 'gen': int(math.log2(k)), 'name': p['name'], 'surname': (p['surname'] or '').title(), 'sex': p['sex'],
         'years': (f'b. {by}' if live else f"{by or '?'}–{dy or '?'}") if (by or dy) else '', 'living': live}
    if not live:
        if p['birth']: c['born'] = p['birth']
        if p['death']: c['died'] = p['death']
        if p['burial'] and p['burial']['place']: c['buried'] = p['burial']['place']
    c['media'] = sorted({media.get(m, '') for m in p['media'] if media.get(m)})
    sb = siblings(x)
    if sb: c['siblings'] = sb
    # marriage of this person's parents is shown on the parents; here, the person's own first marriage
    for f in p['fams'][:1]:
        fm = fams.get(f) or {}
        if fm.get('marr') and fm['marr'].get('date') and not live: c['married'] = fm['marr']
        c['children'] = len(fm.get('chil', []))
    return c

PED = ped
out = {'source': 'GEDCOM family tree export, ' + v(recs.get('HEAD'), 'DATE'),
       'count': len(people), 'root': 1,
       'earliest': min(year((p['birth'] or {}).get('date')) or 9999 for p in people.values()),
       'ancestors': [card(k) for k in sorted(ped)], 'twins': sorted(set(merged))}
out['maxgen'] = max(a['gen'] for a in out['ancestors'])
if spouse:
    sp = pedigree(spouse[0]); m = spouse[1].get('marr') or {}
    out['spouse'] = {'ancestors': [card(k, sp) for k in sorted(sp)], 'married': m if m.get('date') or m.get('place') else None}
    out['spouse']['maxgen'] = max(a['gen'] for a in out['spouse']['ancestors'])
print('/* Generated by gedcom_to_tree.py from a GEDCOM export. Re-run it after a new export;')
print('   do not hand-edit. Living people show a name and birth year only. */')
print('window.TREE = ' + json.dumps(out, ensure_ascii=False, indent=0) + ';')
