(async () => {
  const base = 'http://localhost:3000/api/v1';

  const login = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'parent@example.com', password: 'password123' }),
  });
  const { token } = await login.json();
  console.log('token length:', token.length);

  const me = await fetch(`${base}/users/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(me.status, await me.text());
})();