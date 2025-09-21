import { useAuth } from '@clerk/clerk-react';

/**
 * Custom hook for making authenticated API requests
 */
export const useAuthFetch = () => {
  const { getToken } = useAuth();

  return async (url: string, options: RequestInit = {}) => {
    const token = await getToken();

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };
};

/**
 * Fetch wrapper for non-hook contexts
 */
export const authFetch = async (url: string, getToken: () => Promise<string | null>, options: RequestInit = {}) => {
  const token = await getToken();

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
};