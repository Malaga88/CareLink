(function () {
  var u = CL.guard(['nurse', 'officer']); if (!u) return;
  CL.shell('admin_dashboard.html');
  var $ = function (id) { return document.getElementById(id); };
  $('sub').textContent = (u.role === 'officer' ? 'Bauchi State Ministry of Health' : u.name) + ' \u00b7 All facilities';
  var cls = { 'Pending': 'tag-amber', 'Accepted': 'tag-green', 'In transit': 'tag-blue' };

  function kpis(s) {
    var K = [
      ['Appointments (30d)', s.appointments30d.toLocaleString(), s.bookingAttempts30d + ' booking attempts'],
      ['Scheduling conflict rate', s.conflictRatePct + '%', 'Target: below 5%'],
      ['Avg. API response time', s.avgResponseMs == null ? '\u2013' : s.avgResponseMs + ' ms', 'Target: under 300 ms'],
      ['Pending referrals', String(s.pendingReferrals), 'Waiting for a receiving facility']
    ];
    $('kpis').innerHTML = K.map(function (k) { return '<div class="card"><h2 class="card-label">' + k[0] + '</h2><div class="stat-num">' + k[1] + '</div><div class="stat-note">' + k[2] + '</div></div>'; }).join('');
    var max = Math.max.apply(null, s.weekly.map(function (w) { return w.count; }).concat([1]));
    $('bars').innerHTML = s.weekly.map(function (w) { return '<div class="bar-col"><div class="bar-val">' + w.count + '</div><div class="bar" style="height:' + Math.round(w.count / max * 100) + '%"></div><div class="bar-label">' + w.day + '</div></div>'; }).join('');
    $('lgas').innerHTML = s.lgaUsage.length ? s.lgaUsage.map(function (l) { return '<div class="lga-row"><span class="lga-name">' + CL.esc(l.lga) + '</span><div class="lga-bar-bg" role="img" aria-label="' + CL.esc(l.lga) + ': ' + l.count + ' appointments"><div class="lga-bar-fg" style="width:' + l.pct + '%"></div></div></div>'; }).join('') : '<div class="empty">No appointments yet.</div>';
  }
  function refs(list) {
    $('refs').innerHTML = list.length ? list.map(function (r) {
      var act = r.status === 'Pending' ? '<button type="button" class="btn-ghost btn-sm" data-id="' + CL.esc(r.id) + '" data-to="Accepted">Accept</button>' : r.status === 'Accepted' ? '<button type="button" class="btn-ghost btn-sm" data-id="' + CL.esc(r.id) + '" data-to="In transit">Mark in transit</button>' : '';
      return '<tr><td>' + CL.esc(r.patient) + '</td><td>' + CL.esc(r.from) + '</td><td>' + CL.esc(r.to) + '</td><td>' + CL.esc(r.reason) + '</td><td><span class="tag ' + (cls[r.status] || '') + '">' + CL.esc(r.status) + '</span></td><td>' + act + '</td></tr>';
    }).join('') : '<tr><td colspan="6"><div class="empty">No referrals yet.</div></td></tr>';
  }
  function load() {
    Promise.all([CL.api('/reports/summary'), CL.api('/referrals')]).then(function (r) { kpis(r[0]); refs(r[1].referrals); }).catch(CL.fail);
  }
  $('refs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-id]'); if (!b) return;
    b.disabled = true;
    CL.api('/referrals/' + b.dataset.id + '/status', { method: 'PATCH', body: { status: b.dataset.to } })
      .then(function () { CL.toast('Referral marked ' + b.dataset.to + '.'); load(); }).catch(function (x) { CL.fail(x); b.disabled = false; });
  });
  load();
})();
