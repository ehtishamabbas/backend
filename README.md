# Real Estate Listings Backend (Node.js)

This is a Node.js backend for the Real Estate Listings application, converted from the original Python backend.

## Features

- Property listings data crawler from Trestle API
- Image processing and storage to Google Cloud Storage
- RESTful API for accessing property listings
- MongoDB integration for data storage

## Prerequisites

- Node.js 16+
- MongoDB
- Google Cloud Storage account and credentials

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
TRESTLE_CLIENT_ID=your_client_id
TRESTLE_CLIENT_SECRET=your_client_secret
TOKEN_URL=https://api-trestle.corelogic.com/trestle/oidc/connect/token
API_BASE_URL=https://api-trestle.corelogic.com/trestle/odata
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=listings_db
MONGODB_COLLECTION=listings
MONGODB_IMAGES_COLLECTION=listing_images
BATCH_SIZE=500
API_PAGE_SIZE=1000
API_MAX_PAGES=10
MAX_PROCESSING_ERRORS=1000
CONCURRENT_REQUESTS=10
RATE_LIMIT_PER_SECOND=5
TIMEOUT_SECONDS=180
GCP_BUCKET_NAME=real-estate-images
```

## Installation

```bash
# Install dependencies
npm install

# Run the server
npm start

# Run the crawler
npm run crawler
```

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# Build and start only the API server
docker-compose up -d express-api

# Build and start only the crawler
docker-compose up -d trestle-crawler
```

## API Endpoints

- `GET /api/listings` - Get listings with filtering and pagination
- `GET /api/listings/:listingKey` - Get detailed information for a specific listing
- `GET /api/listings/property-type` - Get available property types and subtypes
- `GET /api/autocomplete` - Get autocomplete suggestions for search
- `GET /api/counties-images` - Get counties images
- `GET /proxy-image` - Proxy images to avoid CORS issues
- `GET /health` - Health check endpoint

## Scripts

- `npm start` - Start the API server
- `npm run crawler` - Run the crawler once
- `npm run dev` - Start the API server with nodemon for development
