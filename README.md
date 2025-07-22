# Real Estate Listings Backend (Node.js)

This is a Node.js backend for the Real Estate Listings application with an optimized folder structure and organization.

## Features

- RESTful API for accessing property listings
- MongoDB integration for data storage
- Organized folder structure following best practices
- Simplified backend-only architecture

## Project Structure

```
src/
├── config/         # Configuration files
│   ├── database.js # Database configuration
│   └── server.js   # Server configuration
├── controllers/    # Route controllers (if needed)
├── middleware/     # Express middleware
│   └── security.js # Security middleware
├── models/         # Database models
│   └── listings.js # Listings model functions
├── routes/         # Express routes
│   ├── autocomplete.js
│   ├── counties.js
│   ├── listings.js
│   └── utility.js
├── services/       # Business logic
├── utils/          # Utility functions
│   └── validateEnv.js # Environment validation
├── app.js          # Express app setup
└── index.js        # Application entry point
```

## Prerequisites

- Node.js 16+
- MongoDB

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=listings_db
PORT=3000
```

## Installation

```bash
# Install dependencies
npm install

# Run the server
npm start

# Run in development mode
npm run dev
```

## API Endpoints

- `GET /api/listings` - Get listings with filtering and pagination
- `GET /api/listings/:listingKey` - Get detailed information for a specific listing
- `GET /api/listings/property-type` - Get available property types and subtypes
- `GET /api/autocomplete` - Get autocomplete suggestions for search
- `GET /api/counties/images` - Get counties images
- `GET /proxy-image` - Proxy images to avoid CORS issues
- `GET /health` - Health check endpoint

## Scripts

- `npm start` - Start the API server
- `npm run dev` - Start the API server with nodemon for development
- `npm run lint` - Run ESLint to check code quality
- `npm run lint:fix` - Run ESLint and fix issues automatically
