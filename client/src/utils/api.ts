export const getApiUrl = (): string => {
  const envUrl = import.meta.env.VITE_API_URL;
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocalhost || import.meta.env.DEV || hostname.endsWith('.onrender.com')) {
      return '';
    }
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    return 'https://synctube-2ar4.onrender.com';
  }
  return envUrl || 'https://synctube-2ar4.onrender.com';
};
