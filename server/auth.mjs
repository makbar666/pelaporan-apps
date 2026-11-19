import { createAuthServer, serializeSetCookie, resolveNeonAuthLogging } from '@neon/auth/server';
import { AppError } from './validation.mjs';

export function authFor(request, responseHeaders, env) {
  if (!env.NEON_AUTH_BASE_URL || !env.NEON_AUTH_COOKIE_SECRET || env.NEON_AUTH_COOKIE_SECRET.length < 32 || !env.DATABASE_URL) {
    throw new AppError(503, 'Layanan online belum dikonfigurasi. Hubungi pengelola aplikasi.');
  }
  const auth = createAuthServer({
    baseUrl: env.NEON_AUTH_BASE_URL,
    cookieSecret: env.NEON_AUTH_COOKIE_SECRET,
    sameSite: 'strict',
    log: resolveNeonAuthLogging({ logLevel: 'silent' }),
    context: () => ({
      getCookies: () => request.headers.get('cookie') || '',
      setCookie: (name, value, options) => responseHeaders.append('set-cookie', serializeSetCookie({ name, value, ...options })),
      getHeader: name => request.headers.get(name),
      getOrigin: () => new URL(request.url).origin,
      getFramework: () => 'netlify'
    })
  });
  return {
    async login(email, password) {
      const result = await auth.signIn.email({ email, password });
      if (result.error || !result.data?.user?.id) throw new AppError(result.error?.status >= 500 ? 502 : 401, 'Login gagal. Periksa email dan password atau coba lagi nanti.');
      return result.data.user.id;
    },
    async userId() {
      // Jangan gunakan cache cookie agar sesi yang sudah dicabut ditolak oleh backend.
      const result = await auth.getSession({ query: { disableCookieCache: 'true' } });
      if (result.error?.status >= 500) throw new AppError(502, 'Layanan login sedang tidak tersedia. Coba lagi.');
      if (!result.data?.user?.id) throw new AppError(401, 'Sesi berakhir. Silakan masuk kembali.');
      return result.data.user.id;
    },
    async logout() {
      const result = await auth.signOut();
      if (result.error) throw new AppError(502, 'Gagal mengakhiri sesi. Coba lagi.');
    }
  };
}
