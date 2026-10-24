// Shared helper every page uses to talk to the backend.
// Usage: const me = await api('/auth/me');
//        await api('/auth/login', { method: 'POST', body: { email, password } });
(function () {
  async function api(path, options = {}) {
    const hasBody = options.body !== undefined;
    const res = await fetch('/api/v1' + path, {
      method: options.method || (hasBody ? 'POST' : 'GET'),
      headers: hasBody ? { 'Content-Type': 'application/json' } : {},
      body: hasBody ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // Response had no JSON body
    }

    if (!res.ok) {
      const err = new Error((data && data.error) || 'Something went wrong (' + res.status + ').');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  window.api = api;
})();
