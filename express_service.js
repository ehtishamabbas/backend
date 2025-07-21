// --- Imports ---
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const logger = require('./logger');
const { setupSwagger } = require('./swagger');
const { validateEnvironment } = require('./validate_env');
const { configureSecurityMiddleware, validateRequestMiddleware } = require('./security');

// --- Load Environment Variables ---
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/';
const DATABASE_NAME = process.env.DATABASE_NAME || 'listings_db';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// --- MongoDB Setup ---
let client;
let db;
let listingsCollection;
let imagesCollection;
let listingTypeCollection;
let seoContentCollection;
let locationCollection;
let countiesImagesCollection;

async function connectToMongoDB() {
  try {
    client = new MongoClient(MONGODB_URL);
    await client.connect();
    logger.info('Connected to MongoDB');

    db = client.db(DATABASE_NAME);
    listingsCollection = db.collection('listings');
    imagesCollection = db.collection('listing_images');
    listingTypeCollection = db.collection('listings_type');
    seoContentCollection = db.collection('seo_contents');
    locationCollection = db.collection('locations');
    countiesImagesCollection = db.collection('counties_images');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// --- Utility Functions ---
function convertObjectId(obj) {
  if (Array.isArray(obj)) {
    return obj.map(item => convertObjectId(item));
  } else if (obj !== null && typeof obj === 'object') {
    if (obj instanceof ObjectId) {
      return obj.toString();
    }

    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertObjectId(value);
    }
    return result;
  } else {
    return obj;
  }
}

// --- Express App Setup ---
const app = express();

// Basic middleware
app.use(express.json());

// Configure security middleware
configureSecurityMiddleware(app);

// Setup Swagger documentation
setupSwagger(app);

// --- Database Operations ---
function upsertListingInDb(listingData) {
  const { images, ...listingWithoutImages } = listingData;

  return listingsCollection.findOne({ listing_key: listingData.listing_key })
    .then(existingListing => {
      if (existingListing) {
        return listingsCollection.updateOne(
          { listing_key: listingData.listing_key },
          { $set: listingWithoutImages }
        );
      } else {
        return listingsCollection.insertOne(listingWithoutImages);
      }
    });
}

function updateListingImages(listingKey, images) {
  return imagesCollection.deleteMany({ listing_key: listingKey })
    .then(() => {
      if (images && images.length > 0) {
        const imageDocs = images.map(url => ({
          listing_key: listingKey,
          image_url: url
        }));
        return imagesCollection.insertMany(imageDocs);
      }
    });
}

function buildListingsQuery(
  city,
  county,
  minPrice,
  maxPrice,
  propertyType,
  minBedrooms,
  minBathrooms,
  yearBuilt
) {
  const query = {};
  const seoQuery = {};

  if (city) {
    query.city = city;
    seoQuery['Location Type'] = 'City';
    seoQuery.Location = city;
  }

  if (county) {
    query.county = county;
    seoQuery['Location Type'] = 'County';
    seoQuery.Location = county;
  }

  if (propertyType) {
    query.property_type = propertyType;
    seoQuery['Category Type'] = 'Property Type';
    seoQuery.Criterion = propertyType;
  }

  if (minBedrooms !== null && minBedrooms !== undefined) {
    query.bedrooms = { $gte: minBedrooms };
    seoQuery['Category Type'] = 'Bedrooms';
    seoQuery.Criterion = `${minBedrooms > 4 ? '5+' : minBedrooms} Bedrooms`;
  }

  if (minBathrooms !== null && minBathrooms !== undefined) {
    query.bathrooms = { $gte: minBathrooms };
  }

  if (yearBuilt !== null && yearBuilt !== undefined) {
    query.year_built = { $gte: yearBuilt };
  }

  // Handle price range
  if (minPrice !== null || maxPrice !== null) {
    const priceQuery = {};
    seoQuery['Category Type'] = 'Price';

    if (minPrice !== null) {
      priceQuery.$gte = minPrice;
      if (minPrice < 500000) {
        seoQuery.Criterion = 'Under $500,000';
      }
    }

    if (maxPrice !== null) {
      priceQuery.$lte = maxPrice;
      if (maxPrice > 5000000) {
        seoQuery.Criterion = 'Over $5,000,000';
      }
    }

    if (minPrice !== null && maxPrice !== null) {
      const priceRanges = [
        [0, 500000, 'Under $500,000'],
        [500000, 1000000, '$500,000 - $1,000,000'],
        [1000000, 2000000, '$1,000,000 - $2,000,000'],
        [2000000, 5000000, '$2,000,000 - $5,000,000'],
        [5000000, Infinity, 'Over $5,000,000']
      ];

      for (const [lower, upper, label] of priceRanges) {
        if (lower <= minPrice && minPrice < upper && maxPrice <= upper) {
          seoQuery.Criterion = label;
          break;
        }
      }

      if (!seoQuery.Criterion) {
        seoQuery.Criterion = `$${Math.floor(minPrice).toLocaleString()} - $${Math.floor(maxPrice).toLocaleString()}`;
      }
    }

    if (Object.keys(priceQuery).length > 0) {
      query.list_price = priceQuery;
    }
  }

  return { query, seoQuery };
}

function getListingsProjection() {
  return {
    _id: 1,
    listing_key: 1,
    listing_id: 1,
    list_price: 1,
    original_list_price: 1,
    previous_list_price: 1,
    lease_amount: 1,
    address: 1,
    city: 1,
    county: 1,
    postal_code: 1,
    latitude: 1,
    longitude: 1,
    property_type: 1,
    property_sub_type: 1,
    bedrooms: 1,
    bathrooms: 1,
    living_area_sqft: 1,
    lot_size_sqft: 1,
    stories: 1,
    year_built: 1,
    description: 1,
    status: 1,
    on_market_timestamp: 1,
    current_price: 1
  };
}

async function fetchImagesForListings(listingKeys) {
  const imagesMap = {};

  if (listingKeys && listingKeys.length > 0) {
    const imagesCursor = await imagesCollection.find({ listing_key: { $in: listingKeys } });
    const images = await imagesCursor.toArray();

    for (const img of images) {
      const key = img.listing_key;
      if (!imagesMap[key]) {
        imagesMap[key] = [];
      }
      imagesMap[key].push(img.image_url);
    }
  }

  return imagesMap;
}

// --- API Routes ---
/**
 * @swagger
 * /api/autocomplete:
 *   get:
 *     summary: Get autocomplete suggestions for search
 *     parameters:
 *       - in: query
 *         name: query
 *         schema:
 *           type: string
 *         description: Search query string
 *     responses:
 *       200:
 *         description: List of autocomplete suggestions
 */
// Autocomplete endpoint
app.get('/api/autocomplete', validateRequestMiddleware({
  query: { type: 'string', min: 1, max: 100, required: false }
}), async (req, res) => {
  try {
    const query = req.query.query;
    const suggestions = [];

    if (query) {
      // County suggestions
      const countyAggregation = await locationCollection.distinct('county', {
        county: { $regex: query, $options: 'i' }
      });

      // City suggestions
      const cityCursor = locationCollection.find(
        { city: { $regex: query, $options: 'i' } },
        { projection: { _id: 0, city: 1, county: 1 } }
      );
      const citySuggestions = await cityCursor.toArray();

      suggestions.push(
        ...countyAggregation.map(suggestion => ({
          type: 'county',
          value: convertObjectId(suggestion)
        }))
      );

      suggestions.push(
        ...citySuggestions.map(suggestion => ({
          type: 'city',
          value: convertObjectId(suggestion)
        }))
      );
    }

    res.json(suggestions);
  } catch (error) {
    logger.error(`Error in autocomplete: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get listings with filtering and pagination
 *     parameters:
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: Filter by city name
 *       - in: query
 *         name: county
 *         schema:
 *           type: string
 *         description: Filter by county name
 *       - in: query
 *         name: min_price
 *         schema:
 *           type: number
 *         description: Minimum price
 *       - in: query
 *         name: max_price
 *         schema:
 *           type: number
 *         description: Maximum price
 *       - in: query
 *         name: property_type
 *         schema:
 *           type: string
 *         description: Property type
 *       - in: query
 *         name: min_bedrooms
 *         schema:
 *           type: integer
 *         description: Minimum number of bedrooms
 *       - in: query
 *         name: min_bathrooms
 *         schema:
 *           type: integer
 *         description: Minimum number of bathrooms
 *       - in: query
 *         name: year_built
 *         schema:
 *           type: integer
 *         description: Minimum year built
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *         description: Number of items to skip (for pagination)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of items to return (max 1000)
 *       - in: query
 *         name: sort_by
 *         schema:
 *           type: string
 *           enum: [recommended, date-desc, price-asc, price-desc, area-desc]
 *         description: Sorting option
 *     responses:
 *       200:
 *         description: List of listings with pagination and SEO content
 */
// Get listings endpoint
app.get('/api/listings', validateRequestMiddleware({
  city: { type: 'string', max: 100, required: false },
  county: { type: 'string', max: 100, required: false },
  min_price: { type: 'number', min: 0, required: false },
  max_price: { type: 'number', min: 0, required: false },
  property_type: { type: 'string', max: 100, required: false },
  min_bedrooms: { type: 'number', min: 0, max: 20, required: false },
  min_bathrooms: { type: 'number', min: 0, max: 20, required: false },
  year_built: { type: 'number', min: 1800, max: 2100, required: false },
  skip: { type: 'number', min: 0, required: false },
  limit: { type: 'number', min: 1, max: 1000, required: false },
  sort_by: { type: 'string', enum: ['recommended', 'date-desc', 'price-asc', 'price-desc', 'area-desc'], required: false }
}), async (req, res) => {
  try {
    // Parse query parameters
    const city = req.query.city;
    const county = req.query.county;
    const minPrice = req.query.min_price ? parseFloat(req.query.min_price) : null;
    const maxPrice = req.query.max_price ? parseFloat(req.query.max_price) : null;
    const propertyType = req.query.property_type;
    const minBedrooms = req.query.min_bedrooms ? parseInt(req.query.min_bedrooms) : null;
    const minBathrooms = req.query.min_bathrooms ? parseInt(req.query.min_bathrooms) : null;
    const yearBuilt = req.query.year_built ? parseInt(req.query.year_built) : null;
    const skip = parseInt(req.query.skip || '0');
    const limit = Math.min(parseInt(req.query.limit || '100'), 1000);
    const sortBy = (req.query.sort_by || 'recommended').toLowerCase();

    // Build query
    const { query, seoQuery } = buildListingsQuery(
      city, county, minPrice, maxPrice, propertyType,
      minBedrooms, minBathrooms, yearBuilt
    );

    const projection = getListingsProjection();

    // Determine sort order
    let sort = {};
    if (sortBy === 'recommended' || sortBy === 'date-desc') {
      sort = { on_market_timestamp: -1 };
    } else if (sortBy === 'price-asc') {
      sort = { list_price: 1 };
    } else if (sortBy === 'price-desc') {
      sort = { list_price: -1 };
    } else if (sortBy === 'area-desc') {
      sort = { lot_size_sqft: -1 };
    } else {
      // Fallback to recommended
      sort = { on_market_timestamp: -1 };
    }

    // Count total items
    const totalItems = await listingsCollection.countDocuments(query);

    // Get listings
    const listingsCursor = listingsCollection.find(query, { projection })
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const listings = await listingsCursor.toArray();

    // Batch fetch images
    const listingKeys = listings.map(listing => listing.listing_key);
    const imagesMap = await fetchImagesForListings(listingKeys);

    // Fetch SEO content
    let seoResult = {};
    if (Object.keys(seoQuery).length > 0) {
      const seoContent = await seoContentCollection.findOne(seoQuery);

      if (seoContent) {
        seoResult = {
          title: seoContent['Generated Title'] || '',
          faq_content: seoContent['FAQ_Content_Generated'] || '',
          seo_title: seoContent['SEO_Title_Generated'] || '',
          url_slug: seoContent['URL Slug'] || '',
          meta_description: seoContent['Meta_Description_Generated'] || '',
          h1_heading: seoContent['H1_Heading_Generated'] || '',
          page_content: seoContent['Main_Content_Generated'] || ''
        };
      }
    }

    // Process listings
    const result = listings.map(listing => {
      listing.images = imagesMap[listing.listing_key] || [];
      return convertObjectId(listing);
    });

    const totalPages = Math.ceil(totalItems / limit);
    const currentPage = Math.floor(skip / limit) + 1;

    res.json({
      listings: result,
      total_items: totalItems,
      total_pages: totalPages,
      current_page: currentPage,
      seo_content: seoResult,
      limit: limit
    });
  } catch (error) {
    logger.error(`Error fetching listings: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/listings/property-type:
 *   get:
 *     summary: Get available property types and subtypes
 *     responses:
 *       200:
 *         description: Property types and subtypes
 *       404:
 *         description: Property types not found
 */
// Get property types endpoint
app.get('/api/listings/property-type', async (req, res) => {
  try {
    const propertyTypes = await listingTypeCollection.find({ listing_type: 'property_type' }).toArray();
    const propertySubTypes = await listingTypeCollection.find({ listing_type: 'sub' }).toArray();

    if (!propertyTypes.length && !propertySubTypes.length) {
      logger.error('No property types or sub-types found');
      return res.status(404).json({ error: 'Property types not found' });
    }

    res.json({
      property_type: convertObjectId(propertyTypes),
      property_sub_type: convertObjectId(propertySubTypes)
    });
  } catch (error) {
    logger.error(`Error fetching property types: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /api/listings/{listingKey}:
 *   get:
 *     summary: Get detailed information for a specific listing
 *     parameters:
 *       - in: path
 *         name: listingKey
 *         required: true
 *         schema:
 *           type: string
 *         description: Unique identifier for the listing
 *     responses:
 *       200:
 *         description: Detailed listing information
 *       404:
 *         description: Listing not found
 */
// Get listing detail endpoint
app.get('/api/listings/:listingKey', async (req, res) => {
  try {
    const listingKey = req.params.listingKey;
    const listing = await listingsCollection.findOne({ listing_key: listingKey });

    if (!listing) {
      logger.error(`Listing not found for key: ${listingKey}`);
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Fetch images for this listing
    const imagesCursor = await imagesCollection.find({ listing_key: listingKey });
    const images = await imagesCursor.toArray();
    listing.images = images.map(image => image.image_url || '');

    // Fetch FAQ content from seo_content collection
    const seoQuery = {};
    if (listing.city) {
      seoQuery.Location = listing.county;
    }

    const seoContent = await seoContentCollection.findOne(seoQuery);
    if (seoContent) {
      listing.title = seoContent['Generated Title'] || '';
      listing.faq_content = seoContent['FAQ_Content_Generated'] || '';
      listing.seo_title = seoContent['SEO_Title_Generated'] || '';
      listing.url_slug = seoContent['URL Slug'] || '';
      listing.meta_description = seoContent['Meta_Description_Generated'] || '';
      listing.h1_heading = seoContent['H1_Heading_Generated'] || '';
      listing.page_content = seoContent['Main_Content_Generated'] || '';
      listing.amenities_content = seoContent['Amenities_Content_Generated'] || '';
      listing.keywords = seoContent.keywords || [];
    } else {
      listing.title = '';
      listing.faq_content = '';
      listing.seo_title = '';
      listing.meta_description = '';
      listing.h1_heading = '';
      listing.page_content = '';
      listing.amenities_content = '';
      listing.keywords = [];
    }

    res.json(convertObjectId(listing));
  } catch (error) {
    logger.error(`Error fetching listing ${req.params.listingKey}: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /proxy-image:
 *   get:
 *     summary: Proxy images to avoid CORS issues
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *         description: URL of the image to proxy
 *     responses:
 *       200:
 *         description: Image binary data
 *       400:
 *         description: URL parameter is required
 *       404:
 *         description: Image not found
 */
// Proxy image endpoint
app.get('/proxy-image', validateRequestMiddleware({
  url: { type: 'string', required: true }
}), async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' });
    }

    const response = await axios.get(url, { responseType: 'arraybuffer' });

    if (response.status !== 200) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.set('Content-Type', contentType);
    res.send(response.data);
  } catch (error) {
    logger.error(`Error proxying image ${req.query.url}: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/counties-images:
 *   get:
 *     summary: Get counties images
 *     parameters:
 *       - in: query
 *         name: county
 *         schema:
 *           type: string
 *         description: County name
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City name (optional)
 *     responses:
 *       200:
 *         description: List of county images
 */
// Get counties images endpoint
app.get('/api/counties-images', validateRequestMiddleware({
  county: { type: 'string', required: true },
  city: { type: 'string', required: false }
}), async (req, res) => {
  try {
    const county = req.query.county;
    const city = req.query.city;

    let countiesImages;
    if (city) {
      countiesImages = await countiesImagesCollection.find({ county, city }).toArray();
    } else {
      countiesImages = await countiesImagesCollection.find({ county }).toArray();
    }

    res.json(convertObjectId(countiesImages));
  } catch (error) {
    logger.error(`Error fetching counties images: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     responses:
 *       200:
 *         description: API is healthy
 */
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// --- Server Startup ---
const PORT = process.env.PORT || 3000;

async function startServer() {
  // Validate environment variables
  if (!validateEnvironment()) {
    logger.error('Environment validation failed. Exiting...');
    process.exit(1);
  }

  await connectToMongoDB();

  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down server...');

    if (client) {
      await client.close();
      logger.info('MongoDB connection closed.');
    }

    process.exit(0);
  });
}

// Start the server if this file is run directly
if (require.main === module) {
  startServer().catch(error => {
    logger.error('Error starting server:', error);
    process.exit(1);
  });
}

module.exports = {
  app,
  connectToMongoDB,
  startServer
};
