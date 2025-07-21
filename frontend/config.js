/**
 * Frontend configuration file
 * This file provides configuration options for the frontend application
 * to work with either the Python or Node.js backend
 */

// Backend configuration
const backendConfig = {
  // Python backend (original)
  python: {
    apiBaseUrl: 'http://localhost:8000',
    apiVersion: 'v1',
    imageProxyPath: '/proxy-image'
  },

  // Node.js backend (new)
  nodejs: {
    apiBaseUrl: 'http://localhost:3000',
    apiVersion: 'v1',
    imageProxyPath: '/proxy-image'
  }
};

// Current backend selection
// Change this to 'nodejs' to use the Node.js backend
const currentBackend = 'nodejs';

// Export the selected backend configuration
export const config = backendConfig[currentBackend];

// Helper function to get a full API URL
export function getApiUrl(path) {
  return `${config.apiBaseUrl}/${path}`;
}

// Helper function to get a proxied image URL
export function getProxyImageUrl(imageUrl) {
  return `${config.apiBaseUrl}${config.imageProxyPath}?url=${encodeURIComponent(imageUrl)}`;
}

export default {
  ...config,
  getApiUrl,
  getProxyImageUrl
};
