(function () {
  var u = CL.guard(['patient']); if (!u) return;
  CL.shell('patient_dashboard.html');
  var $ = function (id) { return document.getElementById(id); };
  $('title').textContent = CL.greeting() + ', ' + u.name.split(' ')[0];
  $('sub').textContent = (u.lga ? u.lga + ' LGA \u00b7 ' : '') + 'Patient ID ' + u.patientId;
  $('msgDoc').addEventListener('click', function () { CL.toast('Secure messaging is not built yet.'); });

  function empty() { $('hero').innerHTML = '<div><div class="hl-label">Next appointment</div><div class="hl-title">No upcoming appointment</div><div class="hl-sub">Pick a doctor and a time that suits you.</div></div><a class="btn" href="book_appointment.html">Book appointment</a>'; }

  Promise.all([CL.api('/appointments/mine'), CL.api('/records/mine')]).then(function (r) {
    var appts = r[0].appointments, recs = r[1].records, b = appts[0], rem = '';
    if (b) {
      $('hero').innerHTML = '<div><div class="hl-label">Next appointment</div><div class="hl-title">' + CL.esc(b.doctor.name) + ' &middot; ' + CL.esc(b.department) + '</div><div class="hl-sub">' + CL.esc(CL.long(b.date)) + ' &middot; ' + CL.esc(b.slot) + ' &middot; Video consultation &middot; ' + CL.esc(b.facility.name) + '</div></div><div class="actions" style="margin:0"><button class="btn" type="button" id="join">Join consultation</button><button class="btn-ghost" type="button" id="cancel">Cancel</button></div>';
      $('join').addEventListener('click', function () { CL.toast('Joining opens on ' + CL.short(b.date) + ' at ' + b.slot + '. Video calling is not built yet.'); });
      $('cancel').addEventListener('click', function () {
        if (!confirm('Cancel your appointment with ' + b.doctor.name + ' on ' + CL.short(b.date) + ' at ' + b.slot + '?')) return;
        CL.api('/appointments/' + b.id + '/cancel', { method: 'PATCH' }).then(function () { CL.toast('Appointment cancelled.'); setTimeout(function () { location.reload(); }, 700); }).catch(CL.fail);
      });
      rem += '<div class="tl-row"><span class="timeline-dot"></span><div><div class="tl-text">Appointment with ' + CL.esc(b.doctor.name) + '</div><div class="tl-time">' + CL.esc(CL.short(b.date)) + ' at ' + CL.esc(b.slot) + (appts.length > 1 ? ' (+' + (appts.length - 1) + ' more)' : '') + '</div></div></div>';
    } else empty();

    $('recent').innerHTML = recs.length ? recs.slice(0, 3).map(function (x) {
      return '<div class="record-row"><div><div class="rec-name">' + CL.esc(x.title) + '</div><div class="rec-meta">' + CL.esc(x.where || '') + ' &middot; ' + CL.dmy(x.date) + '</div></div><span class="tag tag-' + CL.esc(x.status[1]) + '">' + CL.esc(x.status[0]) + '</span></div>';
    }).join('') : '<div class="empty">No records yet. They appear here after your first consultation.</div>';
    recs.slice(0, 2).forEach(function (x) { rem += '<div class="tl-row"><span class="timeline-dot"></span><div><div class="tl-text">New record: ' + CL.esc(x.title) + '</div><div class="tl-time">' + CL.dmy(x.date) + '</div></div></div>'; });
    $('reminders').innerHTML = rem || '<div class="tl-row"><div class="tl-text">No reminders yet.</div></div>';
  }).catch(function (e) { CL.fail(e); empty(); $('recent').innerHTML = '<div class="empty">Could not load records.</div>'; });
})();
