import sys, json, time, re
from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import TimeoutException

ROLE, THEME = sys.argv[1], sys.argv[2]
ONLY_VP = sys.argv[3].split(',') if len(sys.argv) > 3 else None
BASE = 'http://localhost:5173'
VIEWPORTS = [('small-mobile', 320, 568), ('mobile', 390, 844), ('mobile-landscape', 844, 390), ('tablet-portrait', 768, 1024),
             ('tablet-landscape', 1024, 768), ('laptop', 1366, 768), ('desktop', 1920, 1080)]
PDF_ID, IMG_ID = open('/tmp/e2e/ids.txt').read().split()
opts = Options(); opts.add_argument('-headless'); opts.binary_location = '/tmp/ffenv/bin/firefox'
d = webdriver.Firefox(options=opts, service=Service('/tmp/ffenv/bin/geckodriver'))
d.set_page_load_timeout(30)

OVERFLOW_JS = """
const vw = document.documentElement.clientWidth; const off = [];
for (const el of document.querySelectorAll('body *')) {
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
  if (r.right > vw + 1 || r.left < -1) {
    let p = el.parentElement, clipped = false;
    while (p && p !== document.body) { const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) { clipped = true; break; } p = p.parentElement; }
    if (!clipped && getComputedStyle(el).position !== 'fixed' && !el.classList.contains('skip')) off.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 40) + ' [' + Math.round(r.left) + ',' + Math.round(r.right) + ']');
  }
}
const small = [];
for (const el of document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button]')) {
  const cs = getComputedStyle(el), r = el.getBoundingClientRect();
  if (!r.width || !r.height || cs.visibility === 'hidden' || el.classList.contains('visually-hidden') || el.classList.contains('skip')) continue;
  if (r.top > innerHeight * 6) continue;
  const inText = el.tagName === 'A' && el.closest('p, li > p');
  if ((r.width < 43.5 || r.height < 43.5) && !inText) small.push(el.tagName.toLowerCase() + ' "' + (el.getAttribute('aria-label') || el.textContent || el.value || '').trim().slice(0, 28) + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
}
return { vw, innerW: innerWidth, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, offenders: off.slice(0, 8), small: small.slice(0, 12), smallCount: small.length };
"""
FRAME = None   # (w, h) when the viewport is narrower than Firefox's minimum window width: render inside an iframe of that size
DLG_JS = "const r=document.querySelector('[role=dialog]').getBoundingClientRect(); return {x:r.left,y:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom,vw:innerWidth,vh:innerHeight}"
def set_vp(w, h):
    global FRAME
    d.switch_to.default_content()
    if w < 500:
        FRAME = (w, h); d.set_window_size(max(w + 60, 520), h + 60); time.sleep(0.2); return (w, h)
    FRAME = None
    d.set_window_size(w, h); time.sleep(0.2)
    iw, ih = d.execute_script('return [innerWidth, innerHeight]')
    if (iw, ih) != (w, h): d.set_window_size(w + (w - iw), h + (h - ih)); time.sleep(0.2)
    return d.execute_script('return [innerWidth, innerHeight]')
def wait(css, t=10): return WebDriverWait(d, t).until(lambda x: x.find_elements(By.CSS_SELECTOR, css) or False)
def goto(path):
    if FRAME:
        d.switch_to.default_content(); d.get(BASE + '/__frame.html')
        d.execute_script("const f=document.getElementById('f'); f.style.width=arguments[0]+'px'; f.style.height=arguments[1]+'px'; f.src=arguments[2];", FRAME[0], FRAME[1], path)
        d.switch_to.frame('f'); time.sleep(0.6)
    else: d.get(BASE + path)
def set_theme():
    d.switch_to.default_content(); d.execute_script(f"localStorage.setItem('cp-theme','{THEME}')")
    if not FRAME: d.refresh(); time.sleep(0.4)
    else: d.switch_to.frame('f'); d.refresh(); time.sleep(0.4)
def login(email):
    goto('/login'); set_theme(); wait('form')
    d.find_element(By.CSS_SELECTOR, 'input[type=email]').send_keys(email); d.find_element(By.CSS_SELECTOR, 'input[type=password]').send_keys('e2e-password-123')
    d.find_element(By.CSS_SELECTOR, 'form button').click(); WebDriverWait(d, 10).until(lambda x: '/login' not in x.current_url)
def record(vp, name, extra=None):
    m = d.execute_script(OVERFLOW_JS); m['frame'] = bool(FRAME); m.update({'role': ROLE, 'theme': THEME, 'vp': vp[0], 'page': name, 'size': f'{vp[1]}x{vp[2]}'}); m.update(extra or {})
    d.save_screenshot(f'/tmp/e2e/shots/{ROLE}-{THEME}-{vp[0]}-{name}.png')
    with open('/tmp/e2e/results.jsonl', 'a') as f: f.write(json.dumps(m) + '\n')
    flag = ('OVERFLOW ' if m['scrollW'] > m['innerW'] + 1 or m['offenders'] else '') + (f"small:{m['smallCount']}" if m['smallCount'] and vp[1] <= 844 else '')
    print(f"{vp[0]:17}{name:20} {flag}")
def canvas_status():
    return d.execute_script("""const c=[...document.querySelectorAll('.pdf-page canvas')].filter(x=>x.width>0)[0]; if(!c) return {rendered:0};
      const g=c.getContext('2d'); const data=g.getImageData(0,0,c.width,c.height).data; let dark=0, blue=0; for(let i=0;i<data.length;i+=16){ if(data[i]<90&&data[i+1]<90&&data[i+2]<90) dark++; if(data[i+2]>150&&data[i]<80) blue++; }
      return {rendered: document.querySelectorAll('.pdf-page canvas').length, drawn: [...document.querySelectorAll('.pdf-page canvas')].filter(x=>x.width>0).length, darkPx: dark, bluePx: blue, w: c.width, h: c.height}""")

try:
    if ROLE != 'guest': login('student@e2e.test' if ROLE == 'student' else 'admin@e2e.test')
    for vp in VIEWPORTS:
        if ONLY_VP and vp[0] not in ONLY_VP: continue
        set_vp(vp[1], vp[2])
        def page(name, path, ready, after=None):
            try:
                goto(path); wait(ready); time.sleep(0.5)
                pre = d.execute_script("return document.documentElement.dataset.theme")
                if THEME == 'dark' and d.execute_script("return document.documentElement.dataset.theme") != 'dark': set_theme(); wait(ready)
                extra = after() if after else {}
                extra = dict(extra or {}, themeOnLoad=pre)
                record(vp, name, extra)
            except TimeoutException: print(f"{vp[0]:17}{name:20} TIMEOUT waiting for {ready}")
        if ROLE == 'guest':
            page('home', '/', '.subject-card')
            def menu():
                btns = d.find_elements(By.CSS_SELECTOR, '.nav .only-mobile')
                if btns and btns[0].is_displayed(): btns[0].click(); time.sleep(0.3); return {'menuOpen': True}
            page('home-menu', '/', '.subject-card', menu)
            def modal():
                d.find_element(By.XPATH, "//button[contains(., 'View Notes')]").click(); wait('[role=dialog]'); time.sleep(0.3)
                dlg = d.find_element(By.CSS_SELECTOR, '[role=dialog]').rect; return {'dialog': d.execute_script(DLG_JS), 'focus': d.execute_script('return document.activeElement.textContent')}
            page('login-required-modal', '/', '.subject-card', modal)
            page('login', '/login', 'form'); page('subjects', '/subjects', '.subject-card'); page('not-found', '/nope', 'h1')
        elif ROLE == 'student':
            page('library', '/app', '.doc-card')
            def pdfcheck():
                for _ in range(40):
                    st = canvas_status()
                    if st.get('drawn', 0) and st.get('darkPx', 0) > 20: break
                    time.sleep(0.25)
                return {'canvas': st, 'zoomLabel': d.find_element(By.CSS_SELECTOR, '.zoom-label').text, 'watermark': d.find_element(By.CSS_SELECTOR, '.watermark').text[:80]}
            page('pdf-reader', f'/app/documents/{PDF_ID}', '.pdf-page canvas', pdfcheck)
            def imgcheck():
                for _ in range(40):
                    if d.execute_script("const i=document.querySelector('.image-stage img'); return i && i.naturalWidth>0 && i.style.visibility!=='hidden'"): break
                    time.sleep(0.25)
                return {'zoomLabel': d.find_element(By.CSS_SELECTOR, '.zoom-label').text}
            page('image-reader', f'/app/documents/{IMG_ID}', '.image-stage img', imgcheck)
        else:
            page('dashboard', '/admin', '.stats'); page('upload', '/admin/upload', 'form'); page('documents', '/admin/documents', 'table')
            def confirm():
                d.find_element(By.CSS_SELECTOR, 'button[aria-label^="Delete"]').click(); wait('[role=dialog]'); time.sleep(0.3); return {'dialog': d.execute_script(DLG_JS), 'focus': d.execute_script('return document.activeElement.textContent')}
            page('delete-dialog', '/admin/documents', 'table', confirm)
            def adminmenu():
                b = d.find_elements(By.CSS_SELECTOR, '.admin-top .only-mobile')
                if b and b[0].is_displayed(): b[0].click(); time.sleep(0.4); return {'menuOpen': True}
            page('admin-menu', '/admin', '.stats', adminmenu)
finally:
    d.quit()
