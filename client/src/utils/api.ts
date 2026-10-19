export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Vercel deployment: call Render backend directly
    if (hostname.includes('vercel.app')) {
      if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
        return envUrl;
      }
      return 'https://synctube-qg7l.onrender.com';
    }

    if (isLocalhost || import.meta.env.DEV || hostname.endsWith('.onrender.com')) {
      return '';
    }
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return 'https://synctube-qg7l.onrender.com';
  }
  return envUrl || 'https://synctube-qg7l.onrender.com';
};
