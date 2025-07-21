# Frontend Integration Guide

This document provides instructions for integrating the frontend application with the new Node.js backend API.

## API Base URL

The API is available at:

```
http://localhost:3000
```

For production, this will be the deployed URL of your Node.js backend.

## API Endpoints

### Get Listings

```
GET /api/listings
```

Query parameters:
- `city` - Filter by city name
- `county` - Filter by county name
- `min_price` - Minimum price
- `max_price` - Maximum price
- `property_type` - Property type
- `min_bedrooms` - Minimum number of bedrooms
- `min_bathrooms` - Minimum number of bathrooms
- `year_built` - Minimum year built
- `skip` - Number of items to skip (for pagination)
- `limit` - Number of items to return (max 1000)
- `sort_by` - Sorting option (recommended, date-desc, price-asc, price-desc, area-desc)

Response:
```json
{
  "listings": [
    {
      "_id": "...",
      "listing_key": "...",
      "list_price": 500000,
      "address": "...",
      "city": "...",
      "county": "...",
      "bedrooms": 3,
      "bathrooms": 2,
      "images": ["https://..."]
    }
  ],
  "total_items": 100,
  "total_pages": 10,
  "current_page": 1,
  "seo_content": {
    "title": "...",
    "faq_content": "...",
    "seo_title": "...",
    "url_slug": "...",
    "meta_description": "...",
    "h1_heading": "...",
    "page_content": "..."
  },
  "limit": 10
}
```

### Get Listing Detail

```
GET /api/listings/:listingKey
```

Response:
```json
{
  "_id": "...",
  "listing_key": "...",
  "list_price": 500000,
  "address": "...",
  "city": "...",
  "county": "...",
  "bedrooms": 3,
  "bathrooms": 2,
  "images": ["https://..."],
  "title": "...",
  "faq_content": "...",
  "seo_title": "...",
  "url_slug": "...",
  "meta_description": "...",
  "h1_heading": "...",
  "page_content": "..."
}
```

### Get Property Types

```
GET /api/listings/property-type
```

Response:
```json
{
  "property_type": [
    {
      "_id": "...",
      "listing_type": "property_type",
      "name": "Residential"
    }
  ],
  "property_sub_type": [
    {
      "_id": "...",
      "listing_type": "sub",
      "name": "Single Family"
    }
  ]
}
```

### Autocomplete

```
GET /api/autocomplete?query=San
```

Response:
```json
[
  {
    "type": "county",
    "value": "San Diego"
  },
  {
    "type": "city",
    "value": {
      "city": "San Diego",
      "county": "San Diego"
    }
  }
]
```

### Get Counties Images

```
GET /api/counties-images?county=San%20Diego&city=San%20Diego
```

Response:
```json
[
  {
    "_id": "...",
    "county": "San Diego",
    "city": "San Diego",
    "image_url": "https://..."
  }
]
```

### Proxy Image

```
GET /proxy-image?url=https://...
```

Response: The image binary data with appropriate content type header.

### Health Check

```
GET /health
```

Response:
```json
{
  "status": "healthy"
}
```

## Frontend Changes Required

1. Update API base URL in your frontend configuration:

```javascript
// Before (Python FastAPI)
const API_BASE_URL = 'http://localhost:8000';

// After (Node.js Express)
const API_BASE_URL = 'http://localhost:3000';
```

2. The response format is identical to the Python backend, so no changes to data handling are needed.

3. If you're using TypeScript, update your type definitions to match the response formats shown above.

## Testing the Integration

1. Start the Node.js backend:
```bash
npm start
```

2. Start your frontend application and verify that all features work correctly:
   - Listing search and filtering
   - Listing details
   - Property type filtering
   - Autocomplete search
   - Image loading

## Troubleshooting

If you encounter any issues:

1. Check the browser console for errors
2. Verify that the Node.js backend is running
3. Check the backend logs for any errors
4. Ensure that CORS is properly configured if you're running the frontend on a different port
5. Verify that all environment variables are correctly set in the `.env` file
