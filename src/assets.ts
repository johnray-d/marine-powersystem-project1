/**
 * Utility functions for resolving public asset paths and assembly URLs
 * across local development servers, preview servers, and subpath deployments
 * (such as GitHub Pages under https://<user>.github.io/<repo>/).
 */

export function resolvePublicAsset(assetPath: string): string {
  const cleanPath = assetPath.replace(/^\/+/, '');
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '';
  if (base && base.startsWith('/') && base !== '/') {
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${cleanBase}${cleanPath}`;
  }
  if (typeof window !== 'undefined' && window.location) {
    let p = window.location.pathname;
    if (!p.endsWith('/')) {
      if (p.endsWith('.html') || p.endsWith('.htm')) {
        p = p.substring(0, p.lastIndexOf('/') + 1);
      } else {
        p = `${p}/`;
      }
    }
    return `${p}${cleanPath}`;
  }
  return `./${cleanPath}`;
}

export function resolveAssemblyUrl(filename: string): string {
  const base = typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL ? import.meta.env.BASE_URL : '';
  if (base && base.startsWith('/') && base !== '/') {
    const cleanBase = base.endsWith('/') ? base : `${base}/`;
    return `${window.location.origin}${cleanBase}assemblies/${filename}`;
  }
  let path = typeof window !== 'undefined' && window.location ? window.location.pathname : '/';
  if (!path.endsWith('/')) {
    if (path.endsWith('.html') || path.endsWith('.htm')) {
      path = path.substring(0, path.lastIndexOf('/') + 1);
    } else {
      path = `${path}/`;
    }
  }
  return `${window.location.origin}${path}assemblies/${filename}`;
}
