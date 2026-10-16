(function () {
  var u = CL.guard(['patient']); if (!u) return;
  CL.shell('book_appointment.html');
  var $ = function (id) { return document.getElementById(id); };
  var fac = $('facility'), dept = $('dept'), doc = $('doctor'), date = $('date'), slotsBox = $('slots'), conflict = $('conflict'), confirmBtn = $('confirm');
  var facilities = [], doctors = [], selected = null, token = 0;
  $('sPatient').textContent = u.name;

  function opts(sel, items) { sel.innerHTML = items.map(function (i) { return '<option value="' + CL.esc(i[0]) + '">' + CL.esc(i[1]) + '</option>'; }).join(''); }
  function currentDoc() { return doctors.filter(function (d) { return d.id === doc.value; })[0]; }

  function fillDepts() {
    var ds = []; doctors.forEach(function (d) { if (d.facilityId === fac.value && ds.indexOf(d.department) < 0) ds.push(d.department); });
    opts(dept, ds.map(function (d) { return [d, d]; })); fillDoctors();
  }
  function fillDoctors() {
    opts(doc, doctors.filter(function (d) { return d.facilityId === fac.value && d.department === dept.value; }).map(function (d) { return [d.id, d.name]; })); fillDates();
  }
  function fillDates() {
    var d = currentDoc(); if (!d) { date.innerHTML = ''; slotsBox.innerHTML = '<p class="note">No doctors available for this choice.</p>'; selected = null; summary(); return; }
    opts(date, d.dates.map(function (s) { return [s, CL.long(s)]; })); drawSlots();   // dates come from the server (clinic time)
  }
  function drawSlots(keepBanner) {
    selected = null; if (!keepBanner) conflict.hidden = true;
    var d = currentDoc(), s = date.value; if (!d || !s) return;
    var mine = ++token;
    $('slotsLbl').textContent = 'Available time slots \u2014 ' + CL.long(s);
    slotsBox.innerHTML = '<span class="note">Checking availability\u2026</span>'; summary();
    CL.api('/doctors/' + d.id + '/availability?date=' + s).then(function (r) {
      if (mine !== token) return; // a newer request superseded this one
      slotsBox.innerHTML = '';
      r.slots.forEach(function (sl) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.textContent = sl.time; b.disabled = sl.taken; b.setAttribute('aria-pressed', 'false');
        if (sl.taken) b.setAttribute('aria-label', sl.time + ', unavailable');
        b.addEventListener('click', function () { selected = sl.time; slotsBox.querySelectorAll('.slot').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); conflict.hidden = true; summary(); });
        slotsBox.appendChild(b);
      });
    }).catch(function (e) { slotsBox.innerHTML = '<span class="note">Could not load slots.</span>'; CL.fail(e); });
  }
  function summary() {
    var d = currentDoc(), f = facilities.filter(function (x) { return x.id === fac.value; })[0];
    $('sFacility').textContent = f ? f.shortName : '\u2013';
    $('sDoctor').textContent = d ? d.name : '\u2013';
    $('sDate').textContent = date.value ? CL.short(date.value) : '\u2013';
    $('sTime').textContent = selected || 'Select a time';
    confirmBtn.disabled = !selected;
  }

  fac.addEventListener('change', fillDepts); dept.addEventListener('change', fillDoctors); doc.addEventListener('change', fillDates); date.addEventListener('change', function () { drawSlots(); });

  confirmBtn.addEventListener('click', function () {
    var d = currentDoc(); CL.busy(confirmBtn, true, 'Booking\u2026');
    CL.api('/appointments', { method: 'POST', body: { doctorId: d.id, date: date.value, slot: selected, reason: $('reason').value.trim() } })
      .then(function () { CL.toast('Booked for ' + CL.short(date.value) + ' at ' + selected + '.'); setTimeout(function () { location.href = 'patient_dashboard.html'; }, 900); })
      .catch(function (e) {
        CL.busy(confirmBtn, false);
        if (e.status === 409) { drawSlots(true); conflict.textContent = e.message; conflict.hidden = false; } else CL.fail(e);
      });
  });

  function setup(msg, retry) {
    var b = $('setup'); b.hidden = false; b.innerHTML = CL.esc(msg) + (retry ? ' <button type="button" class="linklike" id="retry">Try again</button>' : '');
    [fac, dept, doc, date].forEach(function (s) { s.innerHTML = ''; s.disabled = true; });
    slotsBox.innerHTML = ''; confirmBtn.disabled = true; $('reason').disabled = true;
    if (retry) $('retry').addEventListener('click', function () { location.reload(); });
  }
  Promise.all([CL.api('/facilities'), CL.api('/doctors')]).then(function (r) {
    doctors = r[1].doctors;
    // Only offer facilities that have at least one doctor, so no dropdown is ever empty.
    facilities = r[0].facilities.filter(function (f) { return doctors.some(function (d) { return d.facilityId === f.id; }); });
    if (!doctors.length || !facilities.length) { setup('No doctors are available for booking yet. A Health Officer needs to add a facility and at least one doctor first. Please check back soon.'); summary(); return; }
    opts(fac, facilities.map(function (f) { return [f.id, f.name]; })); fillDepts();
  }).catch(function (e) { setup('Could not load doctors and facilities. ' + (e.message || ''), true); });
})();
