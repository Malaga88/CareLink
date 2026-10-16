(function () {
  var u = CL.guard(['patient']); if (!u) return;
  CL.shell('patient_dashboard.html');
  var $ = function (id) { return document.getElementById(id); };
  $('title').textContent = CL.greeting() + ', ' + u.name.split(' ')[0];
  $('sub').textContent = (u.lga ? u.lga + ' LGA \u00b7 ' : '') + 'Patient ID ' + u.patientId;

  function opens(a) { return a.canJoin ? '' : '<span class="note">Video opens at ' + CL.esc(CL.time(a.opensAt)) + ' on ' + CL.esc(CL.short(a.date)) + '</span>'; }
  function hero(a) {
    if (!a) { $('hero').innerHTML = '<div><div class="hl-label">Next appointment</div><div class="hl-title">No upcoming appointment</div><div class="hl-sub">Pick a doctor and a time that suits you.</div></div><a class="btn" href="book_appointment.html">Book appointment</a>'; return; }
    $('hero').innerHTML = '<div><div class="hl-label">Next appointment</div><div class="hl-title">' + CL.esc(a.doctor.name) + ' &middot; ' + CL.esc(a.department) + '</div><div class="hl-sub">' + CL.esc(CL.long(a.date)) + ' &middot; ' + CL.esc(a.slot) + ' &middot; ' + CL.esc(a.facility.name) + '</div>' + (a.canJoin ? '' : '<div class="hl-sub note">' + opens(a) + '</div>') + '</div><button class="btn" type="button" data-join="' + CL.esc(a.id) + '">Join video call</button>';
  }
  function list(appts) {
    $('upcoming').innerHTML = appts.length ? appts.map(function (a) {
      return '<div class="appt-row"><div><div class="rec-name">' + CL.esc(a.doctor.name) + '</div><div class="rec-meta">' + CL.esc(CL.short(a.date)) + ' &middot; ' + CL.esc(a.slot) + '</div><div class="rec-meta">' + CL.esc(a.facility.name) + '</div>' + opens(a) + '</div>' +
        '<div class="appt-actions"><button class="btn btn-sm" type="button" data-join="' + CL.esc(a.id) + '">Join video</button><button class="btn-ghost btn-sm" type="button" data-cancel="' + CL.esc(a.id) + '" data-label="' + CL.esc(a.doctor.name + ' on ' + CL.short(a.date) + ' at ' + a.slot) + '">Cancel</button></div></div>';
    }).join('') : '<div class="empty">Nothing booked yet.</div>';
  }

  document.addEventListener('click', function (e) {
    var j = e.target.closest('[data-join]'); if (j) { CL.joinCall('/appointments/' + j.dataset.join + '/join', j); return; }
    var c = e.target.closest('[data-cancel]');
    if (c && confirm('Cancel your appointment with ' + c.dataset.label + '?')) {
      c.disabled = true;
      CL.api('/appointments/' + c.dataset.cancel + '/cancel', { method: 'PATCH' }).then(function () { CL.toast('Appointment cancelled.'); setTimeout(function () { location.reload(); }, 600); }).catch(function (x) { CL.fail(x); c.disabled = false; });
    }
  });

  Promise.all([CL.api('/appointments/mine'), CL.api('/records/mine')]).then(function (r) {
    var appts = r[0].appointments, recs = r[1].records;
    hero(appts[0]); list(appts);
    $('recent').innerHTML = recs.length ? recs.slice(0, 4).map(function (x) {
      return '<div class="record-row"><div><div class="rec-name">' + CL.esc(x.title) + '</div><div class="rec-meta">' + CL.esc(x.where || '') + ' &middot; ' + CL.dmy(x.date) + '</div></div><span class="tag tag-' + CL.esc(x.status[1]) + '">' + CL.esc(x.status[0]) + '</span></div>';
    }).join('') : '<div class="empty">No records yet. Your visits and prescriptions appear here after a consultation.</div>';
  }).catch(function (e) { CL.fail(e); hero(null); $('upcoming').innerHTML = '<div class="empty">Could not load appointments.</div>'; $('recent').innerHTML = '<div class="empty">Could not load records.</div>'; });
})();
