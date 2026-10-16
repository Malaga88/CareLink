(function () {
  var u = CL.guard(['doctor']); if (!u) return;
  CL.shell('doctor_console.html');
  var $ = function (id) { return document.getElementById(id); };
  var data = null, cur = 0, facilities = [], histories = {};

  $('qDate').addEventListener('change', function () { if ($('qDate').value) load($('qDate').value); });

  function load(date) {   // no date = today in clinic time, decided by the server
    $('detail').innerHTML = '<div class="empty">Loading&hellip;</div>';
    CL.api('/doctor/queue' + (date ? '?date=' + date : '')).then(function (r) {
      data = r; cur = 0; $('qDate').value = r.date;
      $('sub').textContent = r.doctor.name + ' \u00b7 ' + r.doctor.department + ' \u00b7 ' + r.doctor.facility;
      drawQueue(); drawDetail();
    }).catch(function (e) { CL.fail(e); $('detail').innerHTML = '<div class="empty">Could not load the queue.</div>'; });
  }
  function drawQueue() {
    var q = data.queue;
    $('qCount').textContent = q.length + (q.length === 1 ? ' patient' : ' patients') + ' \u00b7 ' + CL.short(data.date);
    $('queue').innerHTML = q.length ? q.map(function (p, i) {
      return '<button type="button" class="q-item" data-i="' + i + '"' + (i === cur ? ' aria-current="true"' : '') + '><div class="q-name"><span>' + CL.esc(p.patient.name) + '</span>' + (p.consultation ? '<span class="tag tag-green">Seen</span>' : '') + '</div><div class="q-meta">' + CL.esc(p.slot) + (p.reason ? ' \u00b7 ' + CL.esc(p.reason) : '') + '</div></button>';
    }).join('') : '<div class="empty">No appointments on this date.</div>';
  }
  function drawDetail() {
    var p = data.queue[cur];
    if (!p) { $('detail').innerHTML = '<div class="empty">Select a date with appointments to see patients.</div>'; return; }
    var c = p.consultation || {}, pt = p.patient;
    $('detail').innerHTML =
      '<div class="patient-head"><div><h2 class="p-name">' + CL.esc(pt.name) + '</h2><div class="p-meta">' + CL.esc(pt.patientId) + (pt.age ? ' \u00b7 ' + pt.age + (pt.sex || '') : '') + (pt.lga ? ' \u00b7 ' + CL.esc(pt.lga) + ' LGA' : '') + (p.reason ? ' \u00b7 ' + CL.esc(p.reason) : '') + '</div></div><span class="tag tag-blue">Doctor access</span></div>' +
      '<div class="row" style="gap:20px;margin-bottom:0"><div class="col">' +
      '<div class="field"><label for="dx">Diagnosis</label><textarea id="dx" rows="3" maxlength="2000">' + CL.esc(c.diagnosis || '') + '</textarea></div>' +
      '<div class="field"><label for="rx">Prescription</label><textarea id="rx" rows="3" maxlength="2000">' + CL.esc(c.prescription || '') + '</textarea></div>' +
      '<div class="actions" style="margin:0"><button class="btn" type="button" id="save">Save consultation</button><button class="btn-ghost" type="button" id="refer">Refer to another facility</button><button class="btn-ghost" type="button" id="join">Join video call</button></div>' +
      (p.canJoin ? '' : '<p class="note" style="margin-top:8px">The video room opens at ' + CL.esc(CL.time(p.opensAt)) + ' on ' + CL.esc(CL.short(data.date)) + '.</p>') +
      (c.savedAt ? '<p class="note" style="margin-top:10px">Saved ' + new Date(c.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + '.</p>' : '') +
      '</div><div class="col col-narrow" style="width:250px"><h3 class="card-label">Consultation history</h3><div id="hist"><p class="note">Loading&hellip;</p></div></div></div>';
    $('save').addEventListener('click', save);
    $('refer').addEventListener('click', openRefer);
    $('join').addEventListener('click', function () { CL.joinCall('/doctor/appointments/' + p.appointmentId + '/join', $('join')); });
    loadHistory(pt.id);
  }
  function loadHistory(id) {
    var show = function (h) {
      var el = $('hist'); if (!el || data.queue[cur].patient.id !== id) return;
      el.innerHTML = h.length ? h.map(function (x) { return '<div class="hist-item"><div class="hist-title">' + CL.esc(x.title) + '</div><div class="hist-meta">' + CL.esc(x.where || '') + ' &middot; ' + CL.dmy(x.date) + '</div></div>'; }).join('') : '<p class="note">No earlier consultations on record.</p>';
    };
    if (histories[id]) return show(histories[id]);
    CL.api('/doctor/patients/' + id + '/history').then(function (r) { histories[id] = r.history; show(r.history); }).catch(function () { var el = $('hist'); if (el) el.innerHTML = '<p class="note">History unavailable.</p>'; });
  }
  function save() {
    var p = data.queue[cur], dx = $('dx').value.trim();
    if (!dx) { CL.toast('Add a diagnosis before saving.', true); $('dx').focus(); return; }
    CL.busy($('save'), true, 'Saving\u2026');
    CL.api('/doctor/consultations', { method: 'PUT', body: { appointmentId: p.appointmentId, diagnosis: dx, prescription: $('rx').value.trim() } })
      .then(function (r) { p.consultation = r.consultation; delete histories[p.patient.id]; CL.toast('Consultation saved for ' + p.patient.name + '.'); drawQueue(); drawDetail(); })
      .catch(function (e) { CL.fail(e); CL.busy($('save'), false); });
  }

  /* referral dialog */
  var dlg = $('referDlg');
  function openRefer() {
    var p = data.queue[cur];
    var go = function () {
      $('rWho').textContent = 'Patient: ' + p.patient.name + ' (' + p.patient.patientId + ')';
      var others = facilities.filter(function (f) { return f.name !== data.doctor.facility; });
      $('rFac').innerHTML = others.map(function (f) { return '<option value="' + CL.esc(f.id) + '">' + CL.esc(f.name) + '</option>'; }).join('');
      $('rReason').value = p.reason || ''; dlg.showModal(); $('rReason').focus();
    };
    if (facilities.length) go(); else CL.api('/facilities').then(function (r) { facilities = r.facilities; go(); }).catch(CL.fail);
  }
  $('rCancel').addEventListener('click', function () { dlg.close(); });
  $('referForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var p = data.queue[cur], reason = $('rReason').value.trim();
    if (!reason) { CL.toast('Enter a reason for the referral.', true); return; }
    CL.busy($('rOk'), true, 'Sending\u2026');
    CL.api('/doctor/referrals', { method: 'POST', body: { appointmentId: p.appointmentId, toFacilityId: $('rFac').value, reason: reason } })
      .then(function () { dlg.close(); CL.toast('Referral sent for ' + p.patient.name + '.'); })
      .catch(CL.fail).then(function () { CL.busy($('rOk'), false); });
  });

  $('queue').addEventListener('click', function (e) { var b = e.target.closest('.q-item'); if (!b) return; cur = +b.dataset.i; drawQueue(); drawDetail(); });
  load();
})();
