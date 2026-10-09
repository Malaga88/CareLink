(function () {
  var $ = function (id) { return document.getElementById(id); };
  var u = CL.user(); if (u && CL.ROLES[u.role]) { location.replace(CL.ROLES[u.role].home); return; }

  var role = 'patient', box = $('roles'), err = $('err');
  function draw() {
    box.querySelectorAll('button').forEach(function (b) { b.remove(); });
    Object.keys(CL.ROLES).forEach(function (k) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'role-chip' + (k === role ? ' sel' : ''); b.textContent = CL.ROLES[k].label;
      b.setAttribute('aria-pressed', k === role);
      b.addEventListener('click', function () { role = k; err.textContent = ''; draw(); });
      box.appendChild(b);
    });
  }
  draw();

  $('pwToggle').addEventListener('click', function () {
    var pw = $('pw'), show = pw.type === 'password'; pw.type = show ? 'text' : 'password';
    this.textContent = show ? 'Hide' : 'Show'; this.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });

  $('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('email').value.trim(), pw = $('pw').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Enter a valid email address.'; $('email').focus(); return; }
    if (!pw) { err.textContent = 'Enter your password.'; $('pw').focus(); return; }
    err.textContent = ''; CL.busy($('submit'), true, 'Signing in\u2026');
    CL.api('/auth/login', { method: 'POST', body: { email: email, password: pw, role: role } })
      .then(CL.signIn)
      .catch(function (x) { err.textContent = x.message; CL.busy($('submit'), false); });
  });

  // Patient self-registration
  var dlg = $('regDlg');
  $('openRegister').addEventListener('click', function () { $('rErr').textContent = ''; dlg.showModal(); $('rName').focus(); });
  $('rCancel').addEventListener('click', function () { dlg.close(); });
  $('regForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('rName').value.trim(), email = $('rEmail').value.trim(), pw = $('rPw').value, rErr = $('rErr');
    if (!name) { rErr.textContent = 'Enter your full name.'; return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { rErr.textContent = 'Enter a valid email address.'; return; }
    if (pw.length < 8) { rErr.textContent = 'Password must be at least 8 characters.'; return; }
    rErr.textContent = ''; CL.busy($('rSubmit'), true, 'Creating\u2026');
    CL.api('/auth/register', { method: 'POST', body: { name: name, email: email, password: pw, lga: $('rLga').value.trim() } })
      .then(CL.signIn)
      .catch(function (x) { rErr.textContent = x.message; CL.busy($('rSubmit'), false); });
  });
})();
