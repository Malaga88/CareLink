/* CareLink Bauchi — shared demo logic (no backend).
   Everything here stands in for the Node/Express + PostgreSQL API. All data is fictional.
   NOTE: the role guard is a front-end demo only; real access control must be enforced on the server. */
(function () {
  var CL = (window.CL = {});

  /* ---------- storage (safe if blocked) ---------- */
  function tryStore(area) {
    return {
      get: function (k, d) { try { var v = window[area].getItem('cl:' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
      set: function (k, v) { try { window[area].setItem('cl:' + k, JSON.stringify(v)); } catch (e) {} },
      del: function (k) { try { window[area].removeItem('cl:' + k); } catch (e) {} }
    };
  }
  CL.store = tryStore('localStorage');
  CL.session = tryStore('sessionStorage');

  /* ---------- demo data ---------- */
  CL.USERS = {
    patient: { name: 'Amina Ibrahim', first: 'Amina', initials: 'AI', home: 'patient_dashboard.html', email: 'amina.ibrahim@carelink.example', sub: 'Ningi LGA \u00b7 Patient ID PT-04821', label: 'Patient' },
    doctor:  { name: 'Dr. Bello Suleiman', first: 'Dr. Bello', initials: 'BS', home: 'doctor_console.html', email: 'bello.suleiman@carelink.example', sub: 'General Medicine \u00b7 ATBUTH Bauchi', label: 'Doctor' },
    nurse:   { name: 'Nurse Zainab Musa', first: 'Zainab', initials: 'ZM', home: 'admin_dashboard.html', email: 'zainab.musa@carelink.example', sub: 'Facility administration \u00b7 ATBUTH Bauchi', label: 'Nurse/Admin' },
    officer: { name: 'Health Officer', first: 'Officer', initials: 'HO', home: 'admin_dashboard.html', email: 'officer@carelink.example', sub: 'Bauchi State Ministry of Health', label: 'Health Officer' }
  };
  var NAV = {
    patient: [['patient_dashboard.html', 'Dashboard'], ['book_appointment.html', 'Appointments'], ['records.html', 'Medical Records'], [null, 'Consultations'], [null, 'Notifications']],
    doctor:  [['doctor_console.html', 'My Queue'], [null, 'Patient Records'], [null, 'Referrals'], [null, 'Consultations']],
    nurse:   [[null, 'Facility Overview'], ['admin_dashboard.html', 'State Reports'], [null, 'Users & Facilities'], [null, 'Notifications Log']],
    officer: [[null, 'Facility Overview'], ['admin_dashboard.html', 'State Reports'], [null, 'Users & Facilities'], [null, 'Notifications Log']]
  };
  CL.FACILITIES = ['ATBUTH General Hospital \u2014 Bauchi', 'Misau General Hospital', 'Ningi Primary Health Centre'];
  CL.DOCTORS = [
    { id: 'bello', name: 'Dr. Bello Suleiman', dept: 'General Medicine', facility: 0, days: [4] },
    { id: 'hauwa', name: 'Dr. Hauwa Garba', dept: 'General Medicine', facility: 0, days: [2, 5] },
    { id: 'adamu', name: 'Dr. Adamu Yusuf', dept: 'Antenatal Care', facility: 0, days: [1, 3] },
    { id: 'rakiya', name: 'Dr. Rakiya Tanko', dept: 'General Medicine', facility: 1, days: [2, 4] },
    { id: 'saidu', name: 'Dr. Saidu Lawal', dept: 'Antenatal Care', facility: 2, days: [3] }
  ];
  CL.SLOTS = ['9:00 AM', '9:30 AM', '10:30 AM', '11:00 AM', '11:30 AM', '1:00 PM', '2:30 PM'];

  /* ---------- helpers ---------- */
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  CL.iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  CL.parse = function (s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
  CL.long = function (s) { var d = CL.parse(s); return DAYS[d.getDay()] + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()]; };
  CL.short = function (s) { var d = CL.parse(s); return DAYS[d.getDay()].slice(0, 3) + ', ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, 3); };
  CL.esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  CL.greeting = function () { var h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  CL.upcomingDates = function (doc, count) {
    var out = [], d = new Date(); d.setHours(0, 0, 0, 0);
    for (var i = 1; out.length < count && i < 60; i++) {
      var t = new Date(d); t.setDate(d.getDate() + i);
      if (doc.days.indexOf(t.getDay()) > -1) out.push(CL.iso(t));
    }
    return out;
  };
  function hash(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  /* A slot is taken if the "server" already holds a booking for it (seeded pseudo-randomly) or someone booked it in this browser. */
  CL.slotTaken = function (docId, date, slot) {
    var seeded = hash(docId + date + slot) % 4 === 0;
    var blocked = CL.store.get('blocked', []).indexOf([docId, date, slot].join('|')) > -1;
    var mine = CL.store.get('bookings', []).some(function (b) { return b.docId === docId && b.date === date && b.slot === slot; });
    return seeded || blocked || mine;
  };
  CL.upcomingBooking = function () {
    var today = CL.iso(new Date());
    var list = CL.store.get('bookings', []).filter(function (b) { return b.date >= today; });
    list.sort(function (a, b) { return a.date === b.date ? CL.SLOTS.indexOf(a.slot) - CL.SLOTS.indexOf(b.slot) : a.date < b.date ? -1 : 1; });
    return list[0] || null;
  };

  /* ---------- toast ---------- */
  CL.toast = function (msg, warn) {
    var box = document.getElementById('toast');
    if (!box) { box = document.createElement('div'); box.id = 'toast'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
    var t = document.createElement('div'); t.className = 'toast' + (warn ? ' warn' : ''); t.textContent = msg; box.appendChild(t);
    setTimeout(function () { t.remove(); }, 3600);
  };

  /* ---------- auth + shell ---------- */
  CL.user = function () { return CL.session.get('user', null); };
  CL.guard = function (roles) {
    var u = CL.user();
    if (!u || !CL.USERS[u.role]) { location.replace('login.html'); return null; }
    if (roles.indexOf(u.role) === -1) { location.replace(CL.USERS[u.role].home); return null; }
    return u;
  };
  CL.signOut = function () { CL.session.del('user'); location.href = 'login.html'; };

  CL.shell = function (activeFile) {
    var u = CL.user(); if (!u) return;
    var info = CL.USERS[u.role];
    var sb = document.getElementById('sidebar');
    var html = '<a class="brand" href="' + info.home + '"><div class="brand-mark" aria-hidden="true">C</div><div><div class="brand-name">CareLink</div><div class="brand-sub">Bauchi State</div></div></a><nav aria-label="Main">';
    NAV[u.role].forEach(function (n) {
      if (n[0]) html += '<a class="nav-item' + (n[0] === activeFile ? ' active" aria-current="page' : '') + '" href="' + n[0] + '"><span class="nav-dot"></span>' + CL.esc(n[1]) + '</a>';
      else html += '<button type="button" class="nav-item" data-soon="' + CL.esc(n[1]) + '"><span class="nav-dot"></span>' + CL.esc(n[1]) + '<span class="soon">Soon</span></button>';
    });
    html += '</nav><div class="nav-spacer"></div><button type="button" class="nav-item" id="signout"><span class="nav-dot"></span>Sign out</button>';
    sb.innerHTML = html;
    sb.addEventListener('click', function (e) {
      var s = e.target.closest('[data-soon]'); if (s) CL.toast(s.getAttribute('data-soon') + ' is not built yet.');
      if (e.target.closest('#signout')) CL.signOut();
    });
    document.querySelectorAll('[data-user-initials]').forEach(function (el) { el.textContent = info.initials; el.setAttribute('title', info.name); });
    document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = info.name; });
    // mobile menu
    var btn = document.getElementById('menuBtn'), bd = document.getElementById('backdrop');
    function set(open) { sb.classList.toggle('open', open); bd.classList.toggle('open', open); btn.setAttribute('aria-expanded', open); }
    if (btn && bd) { btn.addEventListener('click', function () { set(!sb.classList.contains('open')); }); bd.addEventListener('click', function () { set(false); }); document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); }); }
    // online/offline pill
    var pill = document.getElementById('netPill');
    function net() { if (!pill) return; var on = navigator.onLine; pill.querySelector('.status-dot').className = 'status-dot' + (on ? '' : ' offline'); pill.querySelector('span:last-child').textContent = on ? 'Synced \u00b7 Online' : 'Offline \u00b7 changes saved locally'; }
    window.addEventListener('online', net); window.addEventListener('offline', net); net();
  };
})();
