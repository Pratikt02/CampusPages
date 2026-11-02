import requests, os
B='http://localhost:4000'; H={'Origin':B}; s=requests.Session()
r=s.post(f'{B}/api/auth/login',json={'email':'admin@e2e.test','password':'e2e-password-123'},headers=H); r.raise_for_status(); H['X-CSRF-Token']=r.json()['csrfToken']
sub=s.post(f'{B}/api/admin/subjects',json={'name':'Load Test'},headers=H).json()['id']
size=os.path.getsize('/tmp/e2e/data/big.pdf')
with open('/tmp/e2e/data/big.pdf','rb') as f: d=s.post(f'{B}/api/admin/documents',data={'title':'Big load-test PDF','subjectId':sub},files={'file':('big.pdf',f,'application/pdf')},headers=H); d.raise_for_status()
i=d.json()['id']; s.patch(f'{B}/api/admin/documents/{i}/publish',json={'published':True},headers=H).raise_for_status()
open('/tmp/e2e/ltdoc.txt','w').write(f'{i} {size}'); print('doc',i,size)
