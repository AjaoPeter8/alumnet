document.querySelector('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const form = e.target;
  const username = form.username.value;
  const password = form.password.value;

  const res = await fetch('/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });

  const data = await res.json();
  if (res.ok) {
    localStorage.setItem('token', data.token);
    window.location.href = '/';  // Redirect to dashboard, NOT /chat
  } else {
    alert(data.message);
  }
});
