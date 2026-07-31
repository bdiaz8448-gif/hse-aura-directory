import json, os, re, sys

def esc(s):
    s = '' if s is None else str(s)
    return s.replace('\\','\\\\').replace(';','\\;').replace(',','\\,').replace('\r\n','\\n').replace('\n','\\n')

PRE = re.compile(r'^(dr|mr|mrs|ms|miss|prof|rev|fr)$', re.I)
SUF = re.compile(r'^(jr|sr|ii|iii|iv|md|phd|pe|csp|chst|esq)$', re.I)

def split_name(full):
    raw = (full or '').strip()
    nick = ''
    s = raw
    m = re.search(r'["\u201c\u201d\']([^"\u201c\u201d\']+)["\u201c\u201d\']', s)
    if m: nick = m.group(1); s = s[:m.start()] + ' ' + s[m.end():]
    m = re.search(r'\(([^)]+)\)', s)
    if m:
        if not nick: nick = m.group(1)
        s = s[:m.start()] + ' ' + s[m.end():]
    s = re.sub(r',\s*', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    parts = [p for p in s.split(' ') if p]
    prefix = suffix = ''
    if len(parts) > 1 and PRE.match(parts[0].rstrip('.')):
        prefix = parts.pop(0)
    while len(parts) > 1 and SUF.match(parts[-1].rstrip('.')):
        suffix = parts.pop() + ((' ' + suffix) if suffix else '')
    given = middle = family = ''
    if len(parts) == 1:
        given = parts[0]
    elif len(parts) > 1:
        given = parts[0]; family = parts[-1]
        if len(parts) > 2: middle = ' '.join(parts[1:-1])
    else:
        family = raw
    return given, middle, family, prefix, suffix, nick, raw

def vcard(c):
    g, m, f, pre, suf, nick, disp = split_name(c['name'])
    L = ['BEGIN:VCARD', 'VERSION:3.0']
    L.append('N:%s;%s;%s;%s;%s' % (esc(f), esc(g), esc(m), esc(pre), esc(suf)))
    L.append('FN:' + esc(disp))
    if nick:            L.append('NICKNAME:' + esc(nick))
    if c.get('company'): L.append('ORG:' + esc(c['company']))
    if c.get('role'):    L.append('TITLE:' + esc(c['role']))
    for key, typ in (('cell','CELL'), ('office','WORK')):
        v = c.get(key) or ''
        if any(ch.isdigit() for ch in v):
            for part in v.split('/'):
                if any(ch.isdigit() for ch in part):
                    L.append('TEL;TYPE=%s,VOICE:%s' % (typ, esc(part.strip())))
    if c.get('email'):   L.append('EMAIL;TYPE=INTERNET,WORK:' + esc(c['email']))
    if c.get('trailer'): L.append('NOTE:' + esc('Trailer/office: ' + c['trailer']))
    L.append('END:VCARD')
    return '\r\n'.join(L) + '\r\n'

rows = []
with open('/tmp/vcfgen/contacts.tsv', encoding='utf-8') as fh:
    for line in fh:
        line = line.rstrip('\n')
        if not line.strip(): continue
        p = line.split('\t')
        while len(p) < 8: p.append('')
        rows.append({'id':p[0],'name':p[1],'role':p[2],'company':p[3],
                     'cell':p[4],'office':p[5],'email':p[6],'trailer':p[7]})

outdir = sys.argv[1]
os.makedirs(outdir, exist_ok=True)
n = 0
for c in rows:
    if not c['id'] or not c['name']: continue
    with open(os.path.join(outdir, c['id'] + '.vcf'), 'w', encoding='utf-8', newline='') as fh:
        fh.write(vcard(c))
    n += 1
print('generated', n, 'vcf files')
