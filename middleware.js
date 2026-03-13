import { NextResponse } from 'next/server';

const rateLimitMap = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;

function getRateLimitKey(ip) {
  return `ratelimit:${ip}`;
}

function isRateLimited(ip) {
  const key = getRateLimitKey(ip);
  const now = Date.now();
  
  const record = rateLimitMap.get(key);
  
  if (!record || now - record.startTime > WINDOW_MS) {
    rateLimitMap.set(key, { startTime: now, count: 1 });
    return false;
  }
  
  if (record.count >= MAX_REQUESTS) {
    return true;
  }
  
  record.count++;
  return false;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now - record.startTime > WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}, WINDOW_MS);

export function middleware(request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown';

  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
      { status: 429 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/admin-login/:path*',
  ],
};
