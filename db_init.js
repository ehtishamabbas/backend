// Database initialization script
require('dotenv').config();
const { MongoClient } = require('mongodb');
const logger = require('./logger');

// MongoDB connection details
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/';
const DATABASE_NAME = process.env.DATABASE_NAME || 'listings_db';

// Collections to create with indexes
const collections = [
  {
    name: 'listings',
    indexes: [
      { key: { listing_key: 1 }, unique: true },
      { key: { city: 1 } },
      { key: { county: 1 } },
      { key: { property_type: 1 } },
      { key: { list_price: 1 } },
      { key: { bedrooms: 1 } },
      { key: { bathrooms: 1 } },
      { key: { on_market_timestamp: -1 } },
      { key: { lot_size_sqft: 1 } },
      { key: { living_area_sqft: 1 } },
      { key: { year_built: 1 } },
      { key: { latitude: 1, longitude: 1 } }
    ]
  },
  {
    name: 'listing_images',
    indexes: [
      { key: { listing_key: 1 } }
    ]
  },
  {
    name: 'listings_type',
    indexes: [
      { key: { listing_type: 1 } }
    ]
  },
  {
    name: 'seo_contents',
    indexes: [
      { key: { 'Location Type': 1, 'Location': 1 } },
      { key: { 'Category Type': 1, 'Criterion': 1 } }
    ]
  },
  {
    name: 'locations',
    indexes: [
      { key: { city: 1 } },
      { key: { county: 1 } }
    ]
  },
  {
    name: 'counties_images',
    indexes: [
      { key: { county: 1 } },
      { key: { city: 1 } }
    ]
  }
];

// Initialize database
async function initializeDatabase() {
  let client;

  try {
    logger.info(`Connecting to MongoDB at ${MONGODB_URL}`);
    client = new MongoClient(MONGODB_URL);
    await client.connect();

    const db = client.db(DATABASE_NAME);
    logger.info(`Connected to database: ${DATABASE_NAME}`);

    // Create collections and indexes
    for (const collection of collections) {
      logger.info(`Setting up collection: ${collection.name}`);

      // Create collection if it doesn't exist
      const collectionExists = await db.listCollections({ name: collection.name }).hasNext();
      if (!collectionExists) {
        await db.createCollection(collection.name);
        logger.info(`Created collection: ${collection.name}`);
      } else {
        logger.info(`Collection already exists: ${collection.name}`);
      }

      // Create indexes
      const coll = db.collection(collection.name);
      for (const index of collection.indexes) {
        const indexName = Object.keys(index.key).join('_');
        await coll.createIndex(index.key, {
          name: indexName,
          unique: index.unique || false,
          background: true
        });
        logger.info(`Created index ${indexName} on collection ${collection.name}`);
      }
    }

    logger.info('Database initialization completed successfully');
  } catch (error) {
    logger.error('Error initializing database:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

// Run if this script is executed directly
if (require.main === module) {
  initializeDatabase()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Database initialization failed:', error);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
