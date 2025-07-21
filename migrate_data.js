// Data migration script from Python backend to Node.js backend
require('dotenv').config();
const { MongoClient } = require('mongodb');
const logger = require('./logger');

// MongoDB connection details
const SOURCE_MONGODB_URL = process.env.SOURCE_MONGODB_URL || process.env.MONGODB_URL || 'mongodb://localhost:27017/';
const SOURCE_DATABASE_NAME = process.env.SOURCE_DATABASE_NAME || process.env.DATABASE_NAME || 'listings_db';
const TARGET_MONGODB_URL = process.env.TARGET_MONGODB_URL || process.env.MONGODB_URL || 'mongodb://localhost:27017/';
const TARGET_DATABASE_NAME = process.env.TARGET_DATABASE_NAME || process.env.DATABASE_NAME || 'listings_db';

// Collection mappings (source collection name -> target collection name)
const collectionMappings = {
  'listings': 'listings',
  'listing_images': 'listing_images',
  'listings_type': 'listings_type',
  'seo_contents': 'seo_contents',
  'locations': 'locations',
  'counties_images': 'counties_images'
};

// Migrate data from source to target
async function migrateData() {
  let sourceClient = null;
  let targetClient = null;

  try {
    // Connect to source database
    logger.info(`Connecting to source MongoDB at ${SOURCE_MONGODB_URL}`);
    sourceClient = new MongoClient(SOURCE_MONGODB_URL);
    await sourceClient.connect();
    const sourceDb = sourceClient.db(SOURCE_DATABASE_NAME);
    logger.info(`Connected to source database: ${SOURCE_DATABASE_NAME}`);

    // Connect to target database
    logger.info(`Connecting to target MongoDB at ${TARGET_MONGODB_URL}`);
    targetClient = new MongoClient(TARGET_MONGODB_URL);
    await targetClient.connect();
    const targetDb = targetClient.db(TARGET_DATABASE_NAME);
    logger.info(`Connected to target database: ${TARGET_DATABASE_NAME}`);

    // Migrate each collection
    for (const [sourceCollectionName, targetCollectionName] of Object.entries(collectionMappings)) {
      logger.info(`Migrating collection: ${sourceCollectionName} -> ${targetCollectionName}`);

      // Check if source collection exists
      const sourceCollectionExists = await sourceDb.listCollections({ name: sourceCollectionName }).hasNext();
      if (!sourceCollectionExists) {
        logger.warn(`Source collection does not exist: ${sourceCollectionName}. Skipping.`);
        continue;
      }

      // Get source collection
      const sourceCollection = sourceDb.collection(sourceCollectionName);

      // Count documents in source collection
      const documentCount = await sourceCollection.countDocuments();
      logger.info(`Found ${documentCount} documents in source collection: ${sourceCollectionName}`);

      if (documentCount === 0) {
        logger.info(`Source collection is empty: ${sourceCollectionName}. Skipping.`);
        continue;
      }

      // Get target collection
      const targetCollection = targetDb.collection(targetCollectionName);

      // Clear target collection
      await targetCollection.deleteMany({});
      logger.info(`Cleared target collection: ${targetCollectionName}`);

      // Migrate in batches
      const batchSize = 1000;
      let processedCount = 0;

      // Use cursor to avoid loading all documents into memory
      const cursor = sourceCollection.find({});

      let batch = [];

      // Process documents in batches
      while (await cursor.hasNext()) {
        const document = await cursor.next();
        batch.push(document);

        if (batch.length >= batchSize) {
          await targetCollection.insertMany(batch);
          processedCount += batch.length;
          logger.info(`Migrated ${processedCount}/${documentCount} documents in ${sourceCollectionName}`);
          batch = [];
        }
      }

      // Insert any remaining documents
      if (batch.length > 0) {
        await targetCollection.insertMany(batch);
        processedCount += batch.length;
        logger.info(`Migrated ${processedCount}/${documentCount} documents in ${sourceCollectionName}`);
      }

      logger.info(`Completed migration of collection: ${sourceCollectionName} -> ${targetCollectionName}`);
    }

    logger.info('Data migration completed successfully');
  } catch (error) {
    logger.error('Error during data migration:', error);
    throw error;
  } finally {
    // Close connections
    if (sourceClient) {
      await sourceClient.close();
      logger.info('Source MongoDB connection closed');
    }

    if (targetClient) {
      await targetClient.close();
      logger.info('Target MongoDB connection closed');
    }
  }
}

// Run if this script is executed directly
if (require.main === module) {
  migrateData()
    .then(() => process.exit(0))
    .catch(error => {
      logger.error('Data migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateData };
