export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const queryBackend = urlParams.get('backend') || urlParams.get('server');
      if (queryBackend) {
        localStorage.setItem('synctube_custom_backend', queryBackend);
        return queryBackend.replace(/\/+$/, '');
      }
      const storedBackend = localStorage.getItem('synctube_custom_backend');
      if (storedBackend) {
        return storedBackend.replace(/\/+$/, '');
      }
    } catch {
      // ignore storage/url errors
    }

    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Vercel deployment: call Render backend directly
    if (hostname.includes('vercel.app')) {
      if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        return envUrl;
      }
      return 'https://synctube-vslw.onrender.com';
    }

    if (isLocalhost || import.meta.env.DEV || hostname.endsWith('.onrender.com')) {
      return '';
    }
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return 'https://synctube-vslw.onrender.com';
  }
  return envUrl || 'https://synctube-vslw.onrender.com';
};
