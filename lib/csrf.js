const CSRF_TOKEN_KEY = 'csrf_token';

function generateToken() {
  const array = new Uint32Array(4);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < 4; i++) array[i] = Math.floor(Math.random() * 4294967296);
  }
  return Array.from(array, v => v.toString(16).padStart(8, '0')).join('-');
}

export function getCsrfToken() {
  if (typeof window === 'undefined') return null;
  
  let token = localStorage.getItem(CSRF_TOKEN_KEY);
  if (!token) {
    token = generateToken();
    localStorage.setItem(CSRF_TOKEN_KEY, token);
  }
  return token;
}

export function validateCsrfToken(submittedToken) {
  const storedToken = getCsrfToken();
  if (!storedToken || !submittedToken) return false;
  return storedToken === submittedToken;
}
