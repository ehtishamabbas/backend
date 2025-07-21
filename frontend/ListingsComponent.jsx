import React, { useState, useEffect } from 'react';
import { getListings, getPropertyTypes, getProxyImageUrl } from './api-client';

/**
 * Example React component that uses the API client
 * This demonstrates how to integrate with the Node.js backend
 */
const ListingsComponent = () => {
  // State
  const [listings, setListings] = useState([]);
  const [propertyTypes, setPropertyTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    city: '',
    county: '',
    min_price: '',
    max_price: '',
    property_type: '',
    min_bedrooms: '',
    min_bathrooms: '',
    sort_by: 'recommended'
  });
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    limit: 10
  });

  // Fetch property types on component mount
  useEffect(() => {
    const fetchPropertyTypes = async () => {
      try {
        const data = await getPropertyTypes();
        setPropertyTypes(data.property_type || []);
      } catch (err) {
        console.error('Error fetching property types:', err);
        setError('Failed to load property types');
      }
    };

    fetchPropertyTypes();
  }, []);

  // Fetch listings when filters or pagination change
  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true);
      setError(null);

      try {
        // Prepare query parameters
        const params = {
          ...filters,
          skip: (pagination.currentPage - 1) * pagination.limit,
          limit: pagination.limit
        };

        // Convert empty strings to undefined
        Object.keys(params).forEach(key => {
          if (params[key] === '') {
            params[key] = undefined;
          }
        });

        // Fetch listings
        const data = await getListings(params);
        
        setListings(data.listings || []);
        setPagination({
          currentPage: data.current_page || 1,
          totalPages: data.total_pages || 1,
          totalItems: data.total_items || 0,
          limit: data.limit || 10
        });
      } catch (err) {
        console.error('Error fetching listings:', err);
        setError('Failed to load listings');
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [filters, pagination.currentPage, pagination.limit]);

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 })); // Reset to first page
  };

  // Handle page change
  const handlePageChange = (page) => {
    setPagination(prev => ({ ...prev, currentPage: page }));
  };

  // Render loading state
  if (loading && listings.length === 0) {
    return <div className="loading">Loading listings...</div>;
  }

  // Render error state
  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div className="listings-container">
      {/* Filters */}
      <div className="filters">
        <h3>Filters</h3>
        <div className="filter-row">
          <div className="filter-item">
            <label htmlFor="city">City</label>
            <input
              type="text"
              id="city"
              name="city"
              value={filters.city}
              onChange={handleFilterChange}
              placeholder="Enter city"
            />
          </div>
          <div className="filter-item">
            <label htmlFor="county">County</label>
            <input
              type="text"
              id="county"
              name="county"
              value={filters.county}
              onChange={handleFilterChange}
              placeholder="Enter county"
            />
          </div>
        </div>
        
        <div className="filter-row">
          <div className="filter-item">
            <label htmlFor="min_price">Min Price</label>
            <input
              type="number"
              id="min_price"
              name="min_price"
              value={filters.min_price}
              onChange={handleFilterChange}
              placeholder="Min price"
            />
          </div>
          <div className="filter-item">
            <label htmlFor="max_price">Max Price</label>
            <input
              type="number"
              id="max_price"
              name="max_price"
              value={filters.max_price}
              onChange={handleFilterChange}
              placeholder="Max price"
            />
          </div>
        </div>
        
        <div className="filter-row">
          <div className="filter-item">
            <label htmlFor="property_type">Property Type</label>
            <select
              id="property_type"
              name="property_type"
              value={filters.property_type}
              onChange={handleFilterChange}
            >
              <option value="">All Types</option>
              {propertyTypes.map(type => (
                <option key={type._id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="min_bedrooms">Min Bedrooms</label>
            <select
              id="min_bedrooms"
              name="min_bedrooms"
              value={filters.min_bedrooms}
              onChange={handleFilterChange}
            >
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </div>
          <div className="filter-item">
            <label htmlFor="min_bathrooms">Min Bathrooms</label>
            <select
              id="min_bathrooms"
              name="min_bathrooms"
              value={filters.min_bathrooms}
              onChange={handleFilterChange}
            >
              <option value="">Any</option>
              <option value="1">1+</option>
              <option value="2">2+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="5">5+</option>
            </select>
          </div>
        </div>
        
        <div className="filter-row">
          <div className="filter-item">
            <label htmlFor="sort_by">Sort By</label>
            <select
              id="sort_by"
              name="sort_by"
              value={filters.sort_by}
              onChange={handleFilterChange}
            >
              <option value="recommended">Recommended</option>
              <option value="date-desc">Newest</option>
              <option value="price-asc">Price (Low to High)</option>
              <option value="price-desc">Price (High to Low)</option>
              <option value="area-desc">Largest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="results">
        <h2>Properties ({pagination.totalItems})</h2>
        
        {listings.length === 0 ? (
          <div className="no-results">No listings found matching your criteria.</div>
        ) : (
          <div className="listings-grid">
            {listings.map(listing => (
              <div key={listing._id} className="listing-card">
                <div className="listing-image">
                  {listing.images && listing.images.length > 0 ? (
                    <img 
                      src={getProxyImageUrl(listing.images[0])} 
                      alt={`${listing.address}`} 
                    />
                  ) : (
                    <div className="no-image">No Image</div>
                  )}
                </div>
                <div className="listing-details">
                  <h3>${listing.list_price.toLocaleString()}</h3>
                  <p className="listing-address">{listing.address}</p>
                  <p className="listing-location">{listing.city}, {listing.county}</p>
                  <div className="listing-features">
                    <span>{listing.bedrooms} bd</span>
                    <span>{listing.bathrooms} ba</span>
                    {listing.living_area_sqft && (
                      <span>{listing.living_area_sqft.toLocaleString()} sqft</span>
                    )}
                  </div>
                  <p className="listing-type">{listing.property_type}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="pagination">
            <button
              disabled={pagination.currentPage === 1}
              onClick={() => handlePageChange(pagination.currentPage - 1)}
            >
              Previous
            </button>
            
            <span className="page-info">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            
            <button
              disabled={pagination.currentPage === pagination.totalPages}
              onClick={() => handlePageChange(pagination.currentPage + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ListingsComponent;
