/**
 * Example API client implementation for the frontend
 * This file demonstrates how to update the frontend to work with the Node.js backend
 */

// API base URL - update this to point to your Node.js backend
const API_BASE_URL = 'http://localhost:3000';

/**
 * Fetch listings with filtering and pagination
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} - Listings response
 */
export async function getListings(params = {}) {
  const queryParams = new URLSearchParams();

  // Add parameters to query string
  Object.entries(params).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      queryParams.append(key, value);
    }
  });

  try {
    const response = await fetch(`${API_BASE_URL}/api/listings?${queryParams}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching listings:', error);
    throw error;
  }
}

/**
 * Fetch a single listing by its key
 * @param {string} listingKey - Listing key
 * @returns {Promise<Object>} - Listing detail
 */
export async function getListingDetail(listingKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/listings/${listingKey}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching listing ${listingKey}:`, error);
    throw error;
  }
}

/**
 * Fetch property types
 * @returns {Promise<Object>} - Property types response
 */
export async function getPropertyTypes() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/listings/property-type`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching property types:', error);
    throw error;
  }
}

/**
 * Fetch autocomplete suggestions
 * @param {string} query - Search query
 * @returns {Promise<Array>} - Autocomplete suggestions
 */
export async function getAutocomplete(query) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/autocomplete?query=${encodeURIComponent(query)}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching autocomplete suggestions:', error);
    throw error;
  }
}

/**
 * Fetch counties images
 * @param {string} county - County name
 * @param {string} [city] - City name (optional)
 * @returns {Promise<Array>} - Counties images
 */
export async function getCountiesImages(county, city) {
  const queryParams = new URLSearchParams({ county });

  if (city) {
    queryParams.append('city', city);
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/counties-images?${queryParams}`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching counties images:', error);
    throw error;
  }
}

/**
 * Get proxy image URL
 * @param {string} imageUrl - Original image URL
 * @returns {string} - Proxied image URL
 */
export function getProxyImageUrl(imageUrl) {
  return `${API_BASE_URL}/proxy-image?url=${encodeURIComponent(imageUrl)}`;
}

/**
 * Check API health
 * @returns {Promise<Object>} - Health check response
 */
export async function checkHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error checking API health:', error);
    throw error;
  }
}

// Export all functions
export default {
  getListings,
  getListingDetail,
  getPropertyTypes,
  getAutocomplete,
  getCountiesImages,
  getProxyImageUrl,
  checkHealth
};
