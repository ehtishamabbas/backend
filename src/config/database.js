import { MongoClient } from 'mongodb';

// MongoDB connection details
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/';
const DATABASE_NAME = process.env.DATABASE_NAME || 'listings_db';

// Database collections
let client;
let db;
const collections = {
  listings: null,
  listingImages: null,
  listingType: null,
  seoContent: null,
  locations: null,
  countriesImages: null
};

/**
 * Connect to MongoDB
 */
async function connectToMongoDB() {
  try {
    client = new MongoClient(MONGODB_URL);
    await client.connect();

    db = client.db(DATABASE_NAME);

    // Initialize collections
    collections.listings = db.collection('listings');
    collections.listingImages = db.collection('listing_images');
    collections.listingType = db.collection('listings_type');
    collections.seoContent = db.collection('seo_contents');
    collections.locations = db.collection('locations');
    collections.countriesImages = db.collection('countries_images');

    return db;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    throw error;
  }
}

/**
 * Close MongoDB connection
 */
async function closeConnection() {
  if (client) {
    await client.close();
  }
}

/**
 * Get database collections
 */
function getCollections() {
  return collections;
}

export {
  connectToMongoDB,
  closeConnection,
  getCollections
};
