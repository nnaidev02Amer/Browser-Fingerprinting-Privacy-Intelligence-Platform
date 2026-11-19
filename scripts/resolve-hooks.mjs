// Lets plain Node resolve the extensionless and directory imports used in src/ (Vite resolves them
// itself). Used only by the local verification scripts; the application build does not use this.
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if ((err.code === 'ERR_MODULE_NOT_FOUND' || err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') && /^\.{1,2}\//.test(specifier)) {
      for (const suffix of ['.js', '.jsx', '/index.js']) {
        try { return await nextResolve(specifier + suffix, context); } catch { /* try next */ }
      }
    }
    throw err;
  }
}
