/* CareLink Bauchi — shared frontend helpers: API client, session, role guard, sidebar, toasts.
   Authorization is enforced by the server. The guard below only decides which screen to show. */
(function () {
  var CL = (window.CL = {});
  var API = String(window.CARELINK_API || '').replace(/\/$/, '') + '/api';

  /* ---------- session (cleared when the tab closes) ---------- */
  function ss(op, key, val) {
    try {
      if (op === 'get') { var v = sessionStorage.getItem(key); return v ? JSON.parse(v) : null; }
      if (op === 'set') sessionStorage.setItem(key, JSON.stringify(val));
      if (op === 'del') sessionStorage.removeItem(key);
    } catch (e) { return null; }
  }
  CL.auth = function () { return ss('get', 'cl:auth'); };
  CL.user = function () { var a = CL.auth(); return a && a.user; };
  CL.signIn = function (data) { ss('set', 'cl:auth', { token: data.token, user: data.user }); location.href = CL.ROLES[data.user.role].home; };
  CL.signOut = function () { ss('del', 'cl:auth'); location.href = 'login.html'; };

  CL.ROLES = {
    patient: { label: 'Patient', home: 'patient_dashboard.html' },
    doctor: { label: 'Doctor', home: 'doctor_console.html' },
    nurse: { label: 'Nurse/Admin', home: 'admin_dashboard.html' },
    officer: { label: 'Health Officer', home: 'admin_dashboard.html' }
  };
  var NAV = {
    patient: [['patient_dashboard.html', 'Dashboard'], ['book_appointment.html', 'Book appointment'], ['records.html', 'Medical Records']],
    doctor: [['doctor_console.html', 'My Queue']],
    nurse: [['admin_dashboard.html', 'State Reports']],
    officer: [['admin_dashboard.html', 'State Reports'], ['users.html', 'Users & Facilities']]
  };
  CL.LGAS = ['Alkaleri', 'Bauchi', 'Bogoro', 'Damban', 'Darazo', 'Dass', 'Gamawa', 'Ganjuwa', 'Giade', 'Itas/Gadau', "Jama'are", 'Katagum', 'Kirfi', 'Misau', 'Ningi', 'Shira', 'Tafawa Balewa', 'Toro', 'Warji', 'Zaki'];


  /* ---------- API client ---------- */
  function ApiError(message, status, data) { this.message = message; this.status = status; this.data = data || {}; }
  ApiError.prototype = Object.create(Error.prototype);
  CL.ApiError = ApiError;

  CL.api = function (path, opts) {
    opts = opts || {};
    var a = CL.auth(), headers = { 'Content-Type': 'application/json' };
    if (a && a.token) headers.Authorization = 'Bearer ' + a.token;
    return fetch(API + path, { method: opts.method || 'GET', headers: headers, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .catch(function () { throw new ApiError('Cannot reach the server. Check your connection and try again.', 0); })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            if (res.status === 401 && path.indexOf('/auth/') !== 0) { ss('del', 'cl:auth'); location.href = 'login.html'; }
            throw new ApiError(data.message || 'Something went wrong (' + res.status + ')', res.status, data);
          }
          return data;
        });
      });
  };
  CL.fail = function (err) { CL.toast(err && err.message ? err.message : 'Something went wrong.', true); };

  /* ---------- helpers ---------- */
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  CL.iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  CL.parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  CL.long = function (s) { var d = CL.parse(s); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  CL.short = function (s) { var d = CL.parse(s); return DAYS[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
  CL.dmy = function (s) { var d = CL.parse(s); return String(d.getDate()).padStart(2, '0') + ' ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear(); };
  CL.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  CL.greeting = function () { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  CL.initials = function (name) { var w = String(name || '?').replace(/^(Dr\.|Nurse)\s+/, '').split(/\s+/); return ((w[0] || '')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); };
  CL.busy = function (btn, on, label) { if (!btn) return; if (on) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Please wait\u2026'; } else if (btn.dataset.label) btn.textContent = btn.dataset.label; btn.disabled = !!on; };

  CL.toast = function (msg, warn) {
    var box = document.getElementById('toast');
    if (!box) { box = document.createElement('div'); box.id = 'toast'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast' + (warn ? ' warn' : ''); t.textContent = msg; box.appendChild(t);
    setTimeout(function () { t.remove(); }, 4200);
  };

  // Opens the video room in a new tab. The tab is opened straight from the click so popup blockers allow it.
  CL.joinCall = function (path, btn) {
    var w = window.open('about:blank', '_blank');
    CL.busy(btn, true, 'Opening\u2026');
    CL.api(path).then(function (r) { if (w) { w.opener = null; w.location.href = r.url; } else location.href = r.url; })
      .catch(function (e) { if (w) w.close(); CL.fail(e); })
      .then(function () { CL.busy(btn, false); });
  };
  CL.lgaOptions = function (selected) { return '<option value="">Select\u2026</option>' + CL.LGAS.map(function (l) { return '<option' + (l === selected ? ' selected' : '') + '>' + CL.esc(l) + '</option>'; }).join(''); };
  CL.time = function (iso) { return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };

  /* ---------- change password (forced after an admin creates or resets the account) ---------- */
  CL.changePassword = function (forced) {
    var dlg = document.getElementById('pwDlg');
    if (!dlg) {
      dlg = document.createElement('dialog'); dlg.id = 'pwDlg'; dlg.setAttribute('aria-labelledby', 'pwTitle');
      dlg.innerHTML = '<form method="dialog" id="pwForm" novalidate><h2 id="pwTitle">Change your password</h2><p class="note" id="pwNote" style="margin-bottom:14px"></p>' +
        '<div class="field"><label for="pwCur">Current password</label><input id="pwCur" type="password" autocomplete="current-password" required></div>' +
        '<div class="field"><label for="pwNew">New password (10+ characters)</label><input id="pwNew" type="password" autocomplete="new-password" minlength="10" required></div>' +
        '<p class="error" id="pwErr" role="alert"></p><div class="dlg-actions"><button class="btn-ghost" type="button" id="pwCancel">Cancel</button><button class="btn" type="submit" id="pwSubmit">Change password</button></div></form>';
      document.body.appendChild(dlg);
      dlg.querySelector('#pwCancel').addEventListener('click', function () { dlg.close(); });
      dlg.addEventListener('cancel', function (e) { if (dlg.dataset.forced === '1') e.preventDefault(); });
      dlg.querySelector('#pwForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var cur = dlg.querySelector('#pwCur').value, nw = dlg.querySelector('#pwNew').value, err = dlg.querySelector('#pwErr');
        if (!cur) { err.textContent = 'Enter your current password.'; return; }
        if (nw.length < 10) { err.textContent = 'New password must be at least 10 characters.'; return; }
        err.textContent = ''; CL.busy(dlg.querySelector('#pwSubmit'), true, 'Saving\u2026');
        CL.api('/auth/change-password', { method: 'POST', body: { currentPassword: cur, newPassword: nw } }).then(function (r) {
          var a = CL.auth(); a.user = r.user; ss('set', 'cl:auth', a); dlg.dataset.forced = '0'; dlg.close(); CL.toast('Password changed.');
        }).catch(function (x) { err.textContent = x.message; CL.busy(dlg.querySelector('#pwSubmit'), false); });
      });
    }
    dlg.dataset.forced = forced ? '1' : '0';
    dlg.querySelector('#pwCancel').hidden = !!forced;
    dlg.querySelector('#pwNote').textContent = forced ? 'Your account uses a temporary password. Choose your own to continue.' : 'Enter your current password, then choose a new one.';
    dlg.querySelector('#pwForm').reset(); dlg.querySelector('#pwErr').textContent = '';
    CL.busy(dlg.querySelector('#pwSubmit'), false);
    dlg.showModal(); dlg.querySelector('#pwCur').focus();
  };

  /* ---------- guard + shell ---------- */
  CL.guard = function (roles) {
    var u = CL.user();
    if (!u || !CL.ROLES[u.role]) { location.replace('login.html'); return null; }
    if (roles.indexOf(u.role) === -1) { location.replace(CL.ROLES[u.role].home); return null; }
    return u;
  };

  CL.shell = function (activeFile) {
    var u = CL.user(); if (!u) return;
    var sb = document.getElementById('sidebar');
    var html = '<a class="brand" href="' + CL.ROLES[u.role].home + '"><div class="brand-mark" aria-hidden="true">C</div><div><div class="brand-name">CareLink</div><div class="brand-sub">Bauchi State</div></div></a><nav aria-label="Main">';
    NAV[u.role].forEach(function (n) {
      if (n[0]) html += '<a class="nav-item' + (n[0] === activeFile ? ' active" aria-current="page' : '') + '" href="' + n[0] + '"><span class="nav-dot"></span>' + CL.esc(n[1]) + '</a>';
    });
    html += '</nav><div class="nav-spacer"></div><button type="button" class="nav-item" id="chpw"><span class="nav-dot"></span>Change password</button><button type="button" class="nav-item" id="signout"><span class="nav-dot"></span>Sign out</button>';
    sb.innerHTML = html;
    sb.addEventListener('click', function (e) {
      if (e.target.closest('#signout')) CL.signOut();
      if (e.target.closest('#chpw')) CL.changePassword(false);
    });
    if (u.mustChangePassword) CL.changePassword(true);
    document.querySelectorAll('[data-user-initials]').forEach(function (el) { el.textContent = CL.initials(u.name); el.setAttribute('title', u.name); });
    var btn = document.getElementById('menuBtn'), bd = document.getElementById('backdrop');
    function set(open) { sb.classList.toggle('open', open); bd.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); }
    if (btn && bd) { btn.addEventListener('click', function () { set(!sb.classList.contains('open')); }); bd.addEventListener('click', function () { set(false); }); document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); }); }
    var pill = document.getElementById('netPill');
    function net() { if (!pill) return; var on = navigator.onLine; pill.querySelector('.status-dot').className = 'status-dot' + (on ? '' : ' offline'); pill.querySelector('span:last-child').textContent = on ? 'Online' : 'Offline'; }
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
  };
})();
