import time, json
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait
BASE='http://localhost:5173'
PDF_ID, IMG_ID = open('/tmp/e2e/ids.txt').read().split()
o=Options(); o.add_argument('-headless'); o.binary_location='/tmp/ffenv/bin/firefox'
d=webdriver.Firefox(options=o, service=Service('/tmp/ffenv/bin/geckodriver')); d.set_window_size(1100, 800)
FOCUS_JS="""const e=document.activeElement; if(!e||e===document.body) return null; const cs=getComputedStyle(e);
 const r=e.getBoundingClientRect(); const label=(e.getAttribute('aria-label')||e.textContent||e.id||e.className||'').toString().trim().slice(0,30);
 const outline = cs.outlineStyle!=='none' && parseFloat(cs.outlineWidth)>=2; const shadow = cs.boxShadow!=='none' && /rgb/.test(cs.boxShadow);
 // elements whose focus is shown on a parent (stretched card links) count if the parent has an outline
 const parent = e.closest('.doc-card'); const pcs = parent? getComputedStyle(parent):null; const pout = pcs && pcs.outlineStyle!=='none' && parseFloat(pcs.outlineWidth)>=2;
 return {ol: cs.outlineStyle+'/'+cs.outlineWidth+' type='+(e.type||'')+' fv='+e.matches(':focus-visible'), tag:e.tagName.toLowerCase(), label, visibleIndicator: outline||shadow||!!pout, inView: r.bottom>0&&r.top<innerHeight, w:Math.round(r.width), h:Math.round(r.height)};"""
def tabs(n):
    seq=[]
    for _ in range(n):
        ActionChains(d).send_keys(Keys.TAB).perform(); time.sleep(0.2)
        f=d.execute_script(FOCUS_JS)
        if f: seq.append(f)
        elif seq: break   # focus left the page (wrapped to browser UI): stop; re-entry in automation is not keyboard modality
    return seq
def report(name, seq):
    bad=[s for s in seq if not s['visibleIndicator']]
    print(f"{name:28} tabbed {len(seq):2} elements, {len(bad)} without a visible focus indicator", [f"{b['tag']}:{b['label']} {b['ol']}" for b in bad][:5])
try:
    d.get(BASE+'/'); d.execute_script("localStorage.setItem('cp-theme','light')"); d.refresh(); WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.subject-card'))
    first=tabs(1); print('first Tab target on home:', first[0]['label'] if first else None, '(should be the skip link)')
    d.get(BASE+'/'); WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.subject-card')); report('home', tabs(16))
    d.get(BASE+'/login'); WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'form')); report('login', tabs(8))
    # modal focus trap + Escape
    d.get(BASE+'/'); WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.subject-card'))
    btn=d.find_element(By.XPATH,"//button[contains(., 'View Notes')]"); btn.click(); WebDriverWait(d,5).until(lambda x: x.find_elements(By.CSS_SELECTOR,'[role=dialog]'))
    inside=[]
    for _ in range(7):
        ActionChains(d).send_keys(Keys.TAB).perform(); time.sleep(0.2)
        inside.append(d.execute_script("return !!document.activeElement.closest('[role=dialog]')"))
    print('modal: focus stayed inside dialog for 7 Tab presses:', all(inside))
    ActionChains(d).send_keys(Keys.ESCAPE).perform(); time.sleep(0.3)
    print('modal: Escape closed it:', not d.find_elements(By.CSS_SELECTOR,'[role=dialog]'), '| focus returned to trigger:', d.execute_script("return document.activeElement.textContent").strip()[:20])
    # student pages
    d.get(BASE+'/login'); WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'form'))
    d.find_element(By.CSS_SELECTOR,'input[type=email]').send_keys('student@e2e.test'); d.find_element(By.CSS_SELECTOR,'input[type=password]').send_keys('e2e-password-123'); d.find_element(By.CSS_SELECTOR,'form button').click()
    WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.doc-card')); d.get(BASE+'/app'); WebDriverWait(d,10).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.doc-card')); report('student library', tabs(12))
    d.get(BASE+f'/app/documents/{PDF_ID}'); WebDriverWait(d,15).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.pdf-page canvas')); time.sleep(1); report('pdf reader', tabs(12))
    # keyboard zoom in the PDF reader: focus the scroller and press +
    sc=d.find_element(By.CSS_SELECTOR,'.viewer-scroll'); sc.click(); before=d.find_element(By.CSS_SELECTOR,'.zoom-label').text
    ActionChains(d).send_keys('+').perform(); time.sleep(0.4); after=d.find_element(By.CSS_SELECTOR,'.zoom-label').text
    print(f'pdf reader: "+" key zoom {before} -> {after}'); 
    d.get(BASE+f'/app/documents/{IMG_ID}'); WebDriverWait(d,15).until(lambda x: x.find_elements(By.CSS_SELECTOR,'.image-stage img')); time.sleep(0.8); report('image reader', tabs(8))
finally: d.quit()
