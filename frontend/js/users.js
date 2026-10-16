(function () {
  var u = CL.guard(['officer']); if (!u) return;
  CL.shell('users.html');
  var $ = function (id) { return document.getElementById(id); };
  var DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var ROLE_LABEL = { patient: 'Patient', doctor: 'Doctor', nurse: 'Nurse/Admin', officer: 'Health Officer' };
  var role = '', timer = null, current = [];
  $('fLga').innerHTML = CL.lgaOptions();

  /* ---------- create account form ---------- */
  $('nDays').innerHTML = [1, 2, 3, 4, 5, 6, 0].map(function (d) { return '<label><input type="checkbox" value="' + d + '">' + DAY[d] + '</label>'; }).join('');
  function toggleDoc() { document.querySelectorAll('[data-doc]').forEach(function (el) { el.hidden = $('nRole').value !== 'doctor'; }); }
  $('nRole').addEventListener('change', toggleDoc); toggleDoc();

  function showSecret(who, pw) {
    $('psWho').textContent = who; $('psVal').textContent = pw; $('pwShow').showModal(); $('psVal').focus();
  }
  $('psCopy').addEventListener('click', function () {
    var v = $('psVal').textContent;
    (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { CL.toast('Copied.'); }).catch(function () {
      var r = document.createRange(); r.selectNodeContents($('psVal')); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); CL.toast('Press Ctrl+C to copy.');
    });
  });
  $('psDone').addEventListener('click', function () { $('pwShow').close(); $('psVal').textContent = ''; });
  $('pwShow').addEventListener('close', function () { $('psVal').textContent = ''; });

  $('newUser').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('nErr'), r = $('nRole').value;
    var body = { name: $('nName').value.trim(), email: $('nEmail').value.trim(), role: r };
    if (!body.name) { err.textContent = 'Enter the full name.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) { err.textContent = 'Enter a valid email address.'; return; }
    if (r === 'doctor') {
      body.facilityId = $('nFac').value; body.department = $('nDept').value.trim();
      body.days = [].map.call(document.querySelectorAll('#nDays input:checked'), function (c) { return +c.value; });
      if (!body.facilityId) { err.textContent = 'Choose a facility.'; return; }
      if (!body.department) { err.textContent = 'Enter the department.'; return; }
      if (!body.days.length) { err.textContent = 'Choose at least one working day.'; return; }
    }
    err.textContent = ''; CL.busy($('nSubmit'), true, 'Creating\u2026');
    CL.api('/admin/users', { method: 'POST', body: body }).then(function (res) {
      $('newUser').reset(); toggleDoc(); showSecret(res.user.name + ' \u00b7 ' + res.user.email, res.temporaryPassword); loadUsers(); loadAudit();
    }).catch(function (x) { err.textContent = x.message; }).then(function () { CL.busy($('nSubmit'), false); });
  });

  /* ---------- edit a doctor's schedule ---------- */
  var sched = null;
  $('scDays').innerHTML = $('nDays').innerHTML;
  $('scCancel').addEventListener('click', function () { $('schedDlg').close(); });
  $('schedForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var days = [].map.call(document.querySelectorAll('#scDays input:checked'), function (c) { return +c.value; }), dept = $('scDept').value.trim();
    if (!dept) { $('scErr').textContent = 'Enter the department.'; return; }
    if (!days.length) { $('scErr').textContent = 'Choose at least one working day.'; return; }
    CL.busy($('scSave'), true, 'Saving\u2026');
    CL.api('/admin/users/' + sched.id, { method: 'PATCH', body: { department: dept, days: days } })
      .then(function () { $('schedDlg').close(); CL.toast('Schedule updated.'); loadUsers(); loadAudit(); })
      .catch(function (x) { $('scErr').textContent = x.message; }).then(function () { CL.busy($('scSave'), false); });
  });

  /* ---------- facilities ---------- */
  var facilities = [];
  function loadFacilities() {
    return CL.api('/facilities').then(function (r) {
      facilities = r.facilities;
      $('facList').innerHTML = facilities.map(function (f) { return '<div class="lga-row"><span class="lga-name">' + CL.esc(f.shortName) + '</span><span class="note">' + CL.esc(f.lga || '') + '</span></div>'; }).join('') || '<div class="empty">No facilities yet.</div>';
      $('nFac').innerHTML = facilities.map(function (f) { return '<option value="' + CL.esc(f.id) + '">' + CL.esc(f.name) + '</option>'; }).join('');
      $('noFac').hidden = facilities.length > 0;
    });
  }
  $('newFac').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('fName').value.trim(), short = $('fShort').value.trim();
    if (!name || !short) { $('fErr').textContent = 'Enter the full name and a short name.'; return; }
    if (!$('fLga').value) { $('fErr').textContent = 'Choose the local government area.'; return; }
    $('fErr').textContent = '';
    CL.api('/admin/facilities', { method: 'POST', body: { name: name, shortName: short, lga: $('fLga').value } })
      .then(function () { $('newFac').reset(); CL.toast('Facility added.'); loadFacilities(); loadAudit(); })
      .catch(function (x) { $('fErr').textContent = x.message; });
  });

  /* ---------- accounts table ---------- */
  function chips() {
    var items = [['', 'All'], ['doctor', 'Doctors'], ['nurse', 'Nurses'], ['officer', 'Officers'], ['patient', 'Patients']];
    $('roleFilters').innerHTML = '';
    items.forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = it[1]; b.setAttribute('aria-pressed', role === it[0]);
      b.addEventListener('click', function () { role = it[0]; chips(); loadUsers(); }); $('roleFilters').appendChild(b);
    });
  }
  function loadUsers() {
    var qs = '?' + (role ? 'role=' + role + '&' : '') + ($('uq').value.trim() ? 'q=' + encodeURIComponent($('uq').value.trim()) : '');
    return CL.api('/admin/users' + qs).then(function (r) {
      current = r.users;
      $('users').innerHTML = r.users.length ? r.users.map(function (x) {
        var where = x.doctor ? CL.esc(x.doctor.facility || '') + ' \u00b7 ' + CL.esc(x.doctor.department) + '<div class="note">' + x.doctor.days.map(function (d) { return DAY[d]; }).join(', ') + '</div>' : (x.patientId ? CL.esc(x.patientId) + (x.lga ? ' \u00b7 ' + CL.esc(x.lga) : '') : '');
        var self = x.id === u.id;
        return '<tr><td><b>' + CL.esc(x.name) + '</b><div class="note">' + CL.esc(x.email) + '</div></td><td>' + ROLE_LABEL[x.role] + '</td><td>' + where + '</td>' +
          '<td><span class="tag ' + (x.active ? 'tag-green' : 'tag-grey') + '">' + (x.active ? 'Active' : 'Disabled') + '</span></td>' +
          '<td>' + (self ? '<span class="note">You</span>' : '<button type="button" class="btn-ghost btn-sm" data-act="toggle" data-id="' + CL.esc(x.id) + '" data-active="' + x.active + '" data-name="' + CL.esc(x.name) + '">' + (x.active ? 'Disable' : 'Enable') + '</button>' + (x.doctor ? '<button type="button" class="btn-ghost btn-sm" data-act="sched" data-id="' + CL.esc(x.id) + '">Edit schedule</button>' : '') + '<button type="button" class="btn-ghost btn-sm" data-act="reset" data-id="' + CL.esc(x.id) + '" data-name="' + CL.esc(x.name) + '" data-email="' + CL.esc(x.email) + '">Reset password</button>') + '</td></tr>';
      }).join('') : '<tr><td colspan="5"><div class="empty">No accounts match.</div></td></tr>';
    }).catch(CL.fail);
  }
  $('uq').addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(loadUsers, 250); });
  $('users').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]'); if (!b) return;
    var d = b.dataset;
    if (d.act === 'toggle') {
      var to = d.active !== 'true';
      if (!to && !confirm('Disable ' + d.name + '? They are signed out immediately and cannot sign in until you enable the account again.')) return;
      b.disabled = true;
      CL.api('/admin/users/' + d.id, { method: 'PATCH', body: { active: to } }).then(function (r) {
        CL.toast(d.name + (to ? ' enabled.' : ' disabled.') + (r.futureAppointments ? ' ' + r.futureAppointments + ' upcoming appointment(s) are still booked with this doctor.' : ''), !to && r.futureAppointments > 0);
        loadUsers(); loadAudit();
      }).catch(function (x) { CL.fail(x); b.disabled = false; });
    } else if (d.act === 'sched') {
      var usr = current.filter(function (x) { return x.id === d.id; })[0]; if (!usr || !usr.doctor) return;
      sched = usr; $('scWho').textContent = usr.name + ' \u00b7 ' + (usr.doctor.facility || '');
      $('scDept').value = usr.doctor.department; $('scErr').textContent = '';
      document.querySelectorAll('#scDays input').forEach(function (c) { c.checked = usr.doctor.days.indexOf(+c.value) > -1; });
      $('schedDlg').showModal(); $('scDept').focus();
    } else if (d.act === 'reset') {
      if (!confirm('Reset the password for ' + d.name + '? Their current password stops working.')) return;
      b.disabled = true;
      CL.api('/admin/users/' + d.id + '/reset-password', { method: 'POST' }).then(function (r) { showSecret(d.name + ' \u00b7 ' + d.email, r.temporaryPassword); loadAudit(); })
        .catch(CL.fail).then(function () { b.disabled = false; });
    }
  });

  /* ---------- audit log ---------- */
  var LABEL = { 'user.create': 'Created account', 'user.disable': 'Disabled account', 'user.enable': 'Enabled account', 'user.rename': 'Renamed account', 'user.doctor-profile': 'Updated doctor profile', 'user.reset-password': 'Reset password', 'facility.create': 'Added facility' };
  function loadAudit() {
    return CL.api('/admin/audit?limit=20').then(function (r) {
      $('audit').innerHTML = r.entries.length ? r.entries.map(function (a) {
        var t = new Date(a.at);
        return '<tr><td>' + t.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' + t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '</td><td>' + CL.esc(a.actor) + '</td><td>' + CL.esc(LABEL[a.action] || a.action) + '</td><td>' + CL.esc(a.target || '') + '</td></tr>';
      }).join('') : '<tr><td colspan="4"><div class="empty">No activity yet.</div></td></tr>';
    }).catch(CL.fail);
  }

  chips();
  loadFacilities().then(function () { return loadUsers(); }).then(loadAudit).catch(CL.fail);
})();
