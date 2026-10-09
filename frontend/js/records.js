(function () {
  var u = CL.guard(['patient']); if (!u) return;
  CL.shell('records.html');
  var $ = function (id) { return document.getElementById(id); };
  $('sub').textContent = 'One record across every facility \u00b7 Patient ID ' + u.patientId;
  var R = [], type = 'All', types = ['All', 'Visit', 'Lab', 'Prescription'];

  function chips() {
    $('filters').innerHTML = '';
    types.forEach(function (t) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = t === 'All' ? 'All' : t + 's'; b.setAttribute('aria-pressed', t === type);
      b.addEventListener('click', function () { type = t; chips(); draw(); }); $('filters').appendChild(b);
    });
  }
  function draw() {
    var q = $('q').value.trim().toLowerCase();
    var list = R.filter(function (r) { return (type === 'All' || r.type === type) && (!q || (r.title + ' ' + (r.where || '')).toLowerCase().indexOf(q) > -1); });
    $('list').innerHTML = list.length ? list.map(function (r) {
      var note = String(r.note || '').split('\n').map(function (p) { return '<p>' + CL.esc(p) + '</p>'; }).join('');
      return '<details class="rec"><summary><div><div class="rec-name">' + CL.esc(r.title) + '</div><div class="rec-meta">' + CL.esc(r.where || '') + ' &middot; ' + CL.dmy(r.date) + '</div></div><span class="tag tag-' + CL.esc(r.status[1]) + '">' + CL.esc(r.status[0]) + '</span></summary><div class="rec-body">' + (note || '<p>No further details.</p>') + '</div></details>';
    }).join('') : '<div class="empty">' + (R.length ? 'No records match. Clear the search or choose another filter.' : 'No records yet.') + '</div>';
  }
  $('q').addEventListener('input', draw);
  chips();
  CL.api('/records/mine').then(function (r) { R = r.records; draw(); }).catch(function (e) { CL.fail(e); $('list').innerHTML = '<div class="empty">Could not load records.</div>'; });
})();
