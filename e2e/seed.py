import requests, sys
B = 'http://localhost:5173'; H = {'Origin': 'http://localhost:5173'}
s = requests.Session()
r = s.post(f'{B}/api/auth/login', json={'email': 'admin@e2e.test', 'password': 'e2e-password-123'}, headers=H); r.raise_for_status()
H['X-CSRF-Token'] = r.json()['csrfToken']
def post(path, **kw): x = s.post(f'{B}{path}', headers=H, **kw); x.raise_for_status(); return x.json()
subs = {n: post('/api/admin/subjects', json={'name': n, 'description': d})['id'] for n, d in [
  ('Operating Systems', 'Processes, scheduling, memory management and file systems.'),
  ('Computer Networks', 'Layers, protocols, routing and network security.')]}
def up(title, subject, fname, mime, **extra):
    with open(f'/tmp/e2e/data/{fname}', 'rb') as f:
        d = post('/api/admin/documents', data={'title': title, 'subjectId': subs[subject], **extra}, files={'file': (fname, f, mime)})
    p = s.patch(f'{B}/api/admin/documents/{d["id"]}/publish', json={'published': True}, headers=H); p.raise_for_status()
    print('uploaded+published', d['id'], title, d['fileType'], d.get('pageCount'), d.get('width')); return d['id']
pdf = up('Process Scheduling Notes (Unit 1-12)', 'Operating Systems', 'notes.pdf', 'application/pdf', semester='3', description='CPU scheduling policies')
img = up('Process State Diagram', 'Operating Systems', 'diagram.png', 'image/png', semester='3')
# a draft (unpublished) document to prove it is invisible to students
with open('/tmp/e2e/data/notes.pdf', 'rb') as f:
    d = post('/api/admin/documents', data={'title': 'DRAFT - not for students', 'subjectId': subs['Computer Networks']}, files={'file': ('d.pdf', f, 'application/pdf')})
open('/tmp/e2e/ids.txt', 'w').write(f'{pdf}\n{img}\n')
print('seed done')
