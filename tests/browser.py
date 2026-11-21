"""UI regression with a mock API; does not verify a live Neon deployment.
Requires: Python + playwright, local app server on http://localhost:8083.
"""
import json
import os
import tempfile
import uuid
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=os.environ.get('BROWSER_PATH', r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'),
        headless=True)
    context = browser.new_context(permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    state = {'user': None, 'reports': [], 'fail_save': False}
    base = dict(number='B-1', title='Laporan anggota lain', date='2026-11-19', time='10:30',
                location='Gudang', category='Banjir', reporter='Budi', division='Operasional',
                description='Deskripsi', chronology='Kronologi', impact='', actions='', recommendations='', notes='')
    state['reports'].append(dict(base, id=str(uuid.uuid4()), ownerId='bob', ownerName='Budi', version=1))

    def api(route):
        req = route.request
        url = urlparse(req.url)
        path = url.path.removeprefix('/api/')
        body = req.post_data_json if req.post_data else {}
        status, data = 200, {}
        if path.startswith('reports/') and req.method == 'GET':
            data = {'report': next(r for r in state['reports'] if r['id'] == path.split('/')[-1])}
        elif path == 'login':
            state['user'] = 'bob' if body['email'].startswith('bob') else 'alice'
            data = {'user': dict(id=state['user'], name=state['user'].title())}
        elif path == 'logout':
            state['user'] = None
            data = {'ok': True}
        elif not state['user']:
            status, data = 401, {'error': 'Sesi berakhir. Silakan masuk kembali.'}
        elif path == 'session':
            data = {'user': dict(id=state['user'], name=state['user'].title())}
        elif path == 'reports' and req.method == 'GET':
            scope = parse_qs(url.query).get('scope', ['mine'])[0]
            data = {'reports': [r for r in state['reports'] if scope == 'all' or r['ownerId'] == state['user']], 'nextOffset': None}
        elif req.method != 'GET':
            assert req.headers.get('x-actor-id') == state['user']
            if state['fail_save']:
                status, data = 503, {'error': 'Uji koneksi gagal; coba lagi.'}
            elif path == 'reports':
                report = dict(body, id=str(uuid.uuid4()), ownerId=state['user'], ownerName=state['user'].title(), version=1)
                state['reports'].append(report)
                data = {'report': report}
            elif path == 'reports/import':
                state['reports'] = [r for r in state['reports'] if r['ownerId'] != state['user']]
                state['reports'] += [dict(r, id=str(uuid.uuid4()), ownerId=state['user'], ownerName=state['user'].title(), version=1) for r in body['reports']]
                data = {'ok': True}
            else:
                report = next(r for r in state['reports'] if r['id'] == path.split('/')[-1])
                assert report['ownerId'] == state['user']
                if req.method == 'DELETE':
                    state['reports'].remove(report)
                else:
                    report.update(body)
                    report['version'] += 1
                    data = {'report': report}
        route.fulfill(status=status, json=data)

    page.route('**/api/**', api)
    page.goto('http://localhost:8083')
    page.wait_for_function("!document.getElementById('login-button').disabled")
    assert page.locator('#auth-panel').is_visible()
    assert page.locator('#application').is_hidden()

    def login(email):
        page.locator('#login-email').fill(email)
        page.locator('#login-password').fill('test-password-123')
        page.locator('#login-button').click()
        page.wait_for_selector('#application', state='visible')

    login('alice@example.com')
    assert page.locator('#badge').inner_text() == '0'
    page.locator('#report-form button[type=submit]').click()
    assert page.locator('[aria-invalid=true]').count() > 0
    for k, v in base.items():
        if k == 'category': page.locator('#category').select_option(v)
        else: page.locator('#' + k).fill(v)
    page.locator('#district').select_option('Kab. Demak')
    page.locator('#subdistrict').fill('Demak')
    page.locator('#village').fill('Bintoro')
    page.locator('#source').fill('BPBD Kabupaten')
    page.locator('#affected').fill('40')
    page.locator('#houseFlooded').fill('10')
    page.locator('#loss').fill('10000000')
    page.locator('#number').fill('A-1')
    page.locator('#title').fill('Uji <script>alert(1)</script>')
    page.locator('#description').fill('Teks panjang. ' * 1000)
    page.locator('#affected').fill('150')
    page.locator('#evacuated').fill('20')
    page.locator('#houseHeavy').fill('2')
    png = page.evaluate('''() => { const c=document.createElement('canvas');c.width=100;c.height=100;c.getContext('2d').fillRect(0,0,100,100);return c.toDataURL('image/png').split(',')[1]; }''')
    import base64
    page.locator('#photos').set_input_files({'name':'foto.png','mimeType':'image/png','buffer':base64.b64decode(png)})
    page.wait_for_function("document.querySelectorAll('#photo-previews img').length===1")
    page.wait_for_timeout(700)
    page.reload()
    page.wait_for_selector('#application', state='visible')
    assert page.locator('#number').input_value() == 'A-1'
    state['fail_save'] = True
    page.locator('#report-form button[type=submit]').click()
    page.wait_for_function("!document.querySelector('#report-form button').disabled")
    assert page.locator('#number').input_value() == 'A-1'
    assert len(state['reports']) == 1
    state['fail_save'] = False
    page.locator('#report-form button[type=submit]').click()
    page.wait_for_selector('#recap', state='visible')
    assert page.locator('#rows tr').count() == 1
    assert page.locator('#affected-total').inner_text()=='150'
    assert state['reports'][-1]['photos'][0].startswith('data:image/jpeg;base64,')
    page.locator('#scope').select_option('all')
    page.wait_for_function("document.querySelectorAll('#rows tr').length===2")
    other = page.locator('#rows tr').filter(has_text='B-1')
    assert other.get_by_role('button', name='Edit', exact=True).count() == 0
    assert other.get_by_role('button', name='Hapus', exact=True).count() == 0
    own = page.locator('#rows tr').filter(has_text='A-1')
    assert own.get_by_role('button', name='Edit', exact=True).count() == 1
    assert page.locator('#rows script').count() == 0
    own.get_by_role('button', name='Edit', exact=True).click()
    page.locator('#location').fill('Lokasi diperbarui')
    page.locator('#report-form button[type=submit]').click()
    page.wait_for_selector('#recap', state='visible')
    assert any(r.get('location')=='Lokasi diperbarui' for r in state['reports'])
    page.locator('#scope').select_option('all')
    page.wait_for_function("document.querySelectorAll('#rows tr').length===2")
    page.locator('select[aria-label="Ubah status A-1"]').select_option('Selesai / Tuntas')
    page.wait_for_function("!document.getElementById('scope').disabled")
    assert next(r for r in state['reports'] if r['number']=='A-1')['handlingStatus']=='Selesai / Tuntas'
    page.locator('#status-filter').select_option('Selesai / Tuntas')
    assert page.locator('#rows tr').count()==1
    page.locator('#clear-filter').click()
    page.locator('#rows tr').filter(has_text='A-1').get_by_role('button',name='Detail',exact=True).click()
    page.wait_for_selector('#detail-dialog',state='visible')
    assert page.locator('#detail-dialog img').count()==1
    page.locator('#close-detail').click()
    page.locator('#search').fill('tidak-ada')
    assert page.locator('#rows tr').count() == 0
    page.locator('#clear-filter').click()
    page.locator('#category-filter').select_option('Banjir')
    assert page.locator('#rows tr').count() == 2
    page.locator('#from').fill('2027-01-01')
    assert page.locator('#rows tr').count() == 0
    page.locator('#clear-filter').click()
    page.locator('#preview-summary').click()
    assert 'REKAPITULASI' in page.locator('#documents').inner_text()
    page.locator('[data-tab=recap]').click()
    page.wait_for_timeout(300)
    page.screenshot(path=os.path.join(tempfile.gettempdir(),'bpbd-desktop.png'),full_page=True)
    page.locator('#select-all').check()
    page.locator('#print-selected').click()
    assert page.locator('.document').count() == 2
    page.locator('#copy').click()
    page.wait_for_function("document.getElementById('status').textContent.includes('disalin')")
    assert 'B-1' in page.evaluate('navigator.clipboard.readText()')
    page.pdf(path=os.path.join(tempfile.gettempdir(), 'incident-online-test.pdf'), prefer_css_page_size=True)
    page.locator('[data-tab=recap]').click()
    with page.expect_download() as info: page.locator('#export').click()
    assert len(json.load(open(info.value.path(), encoding='utf-8'))['reports']) == 2
    page.once('dialog', lambda d: d.accept())
    page.locator('#import-file').set_input_files({'name': 'backup.json', 'mimeType': 'application/json', 'buffer': json.dumps({'version': 1, 'reports': [dict(base, number='IMPORTED', id='old-id', ownerId='bob')]}).encode()})
    page.wait_for_function("document.getElementById('status').textContent.includes('dipulihkan online')")
    assert any(r['ownerId'] == 'bob' and r['number'] == 'B-1' for r in state['reports'])
    page.once('dialog', lambda d: d.accept())
    page.get_by_role('button', name='Hapus', exact=True).click()
    page.wait_for_function("document.getElementById('badge').textContent==='0'")
    page.locator('[data-tab=input]').click()
    page.locator('#title').fill('Draf rahasia Alice')
    page.locator('#logout').click()
    page.wait_for_selector('#auth-panel', state='visible')
    assert page.locator('#documents').inner_text() == ''
    login('bob@example.com')
    assert page.locator('#title').input_value() == ''
    page.locator('#logout').click()
    page.wait_for_selector('#auth-panel', state='visible')
    login('alice@example.com')
    assert page.locator('#title').input_value() == 'Draf rahasia Alice'
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.locator('[data-tab=recap]').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    state['user'] = None
    page.locator('#refresh').click()
    page.wait_for_selector('#auth-panel', state='visible')
    assert page.locator('#rows').inner_text() == ''
    assert not errors, errors
    print('PASS browser with mock API: login/logout, draft isolation, CRUD, mine/all, owner controls, filters, import/export, clipboard, long PDF, mobile, expiry, no JavaScript errors')
    browser.close()
