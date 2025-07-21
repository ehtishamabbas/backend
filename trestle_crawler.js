// --- Imports ---
require('dotenv').config();
const axios = require('axios');
const { Storage } = require('@google-cloud/storage');
const { MongoClient } = require('mongodb');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const schedule = require('node-schedule');
const { v4: uuidv4 } = require('uuid');
const axiosRetry = require('axios-retry').default;
const { promisify } = require('util');
const stream = require('stream');
const pipeline = promisify(stream.pipeline);

// --- Logging Configuration ---
const logger = {
  info: (message) => console.log(`${new Date().toISOString()} - INFO - ${message}`),
  error: (message, error) => console.error(`${new Date().toISOString()} - ERROR - ${message}`, error || ''),
  warning: (message) => console.warn(`${new Date().toISOString()} - WARNING - ${message}`),
  critical: (message, error) => console.error(`${new Date().toISOString()} - CRITICAL - ${message}`, error || '')
};

// --- Environment Variable Configuration ---
process.env.GOOGLE_APPLICATION_CREDENTIALS = 'account-key.json';

const TRESTLE_CLIENT_ID = process.env.TRESTLE_CLIENT_ID || 'd63ef0f1cad54d3f9046bd8b33cc70e2';
const TRESTLE_CLIENT_SECRET = process.env.TRESTLE_CLIENT_SECRET || '851035be936449588b55667346f2d2d4';
const TOKEN_URL = process.env.TOKEN_URL || 'https://api-trestle.corelogic.com/trestle/oidc/connect/token';
const API_BASE_URL = process.env.API_BASE_URL || 'https://api-trestle.corelogic.com/trestle/odata';
const GCP_BUCKET_NAME = process.env.GCP_BUCKET_NAME || 'real-estate-images';
const MONGODB_URI = process.env.MONGODB_URL;
const MONGODB_DB = process.env.DATABASE_NAME || 'listings_db';
const MONGODB_LISTINGS_COLLECTION = process.env.MONGODB_COLLECTION || 'listings';
const MONGODB_IMAGES_COLLECTION = process.env.MONGODB_IMAGES_COLLECTION || 'listing_images';

// Validate required environment variables
if (!TRESTLE_CLIENT_ID || !TRESTLE_CLIENT_SECRET) {
  logger.error('ERROR: TRESTLE_CLIENT_ID and TRESTLE_CLIENT_SECRET must be set.');
  process.exit(1);
}

// Processing Parameters
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '500'); // Increased for efficiency
const API_PAGE_SIZE = parseInt(process.env.API_PAGE_SIZE || '1000'); // Max allowed by API
const API_MAX_PAGES = parseInt(process.env.API_MAX_PAGES || '10'); // Enough for 90,000 items (90 * 1000)
const MAX_PROCESSING_ERRORS = parseInt(process.env.MAX_PROCESSING_ERRORS || '1000');
const CONCURRENT_REQUESTS = parseInt(process.env.CONCURRENT_REQUESTS || '10'); // Number of concurrent API calls
const RATE_LIMIT_PER_SECOND = parseInt(process.env.RATE_LIMIT_PER_SECOND || '5'); // API rate limit
const TIMEOUT_SECONDS = parseInt(process.env.TIMEOUT_SECONDS || '180');
const BUCKET_NAME = 'real-estate-images';
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const JPEG_QUALITY = 80;

// --- Global Variables for Token Management ---
let _currentAccessToken = null;
let _tokenExpiresAt = null;
const _tokenRefreshThreshold = 5 * 60 * 1000; // 5 minutes in milliseconds
let _tokenLock = false;

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: (retryCount) => {
    return retryCount * 1000; // 1s, 2s, 3s
  },
  retryCondition: (error) => {
    return (
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500)
    );
  }
});

// --- MongoDB Setup ---
let mongoClient;
let mongoDB;
let mongoListings;
let mongoImages;

async function connectToMongoDB() {
  try {
    if (!MONGODB_URI) {
      logger.warning('MONGODB_URI not set. Running in limited mode without database.');
      return;
    }

    mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    logger.info('Connected to MongoDB');

    mongoDB = mongoClient.db(MONGODB_DB);
    mongoListings = mongoDB.collection(MONGODB_LISTINGS_COLLECTION);
    mongoImages = mongoDB.collection(MONGODB_IMAGES_COLLECTION);
  } catch (error) {
    logger.warning('MongoDB connection error. Running in limited mode without database:', error);
  }
}

// --- Helper Functions ---
function getSafe(data, key, defaultValue = null) {
  const val = data?.[key];
  if (typeof defaultValue === 'number' && val === '') {
    return defaultValue;
  }
  return val !== undefined ? val : defaultValue;
}

async function downloadImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000
    });

    if (response.status === 200) {
      return Buffer.from(response.data);
    } else {
      logger.warning(`Failed to download: ${imageUrl}`);
      return null;
    }
  } catch (error) {
    logger.error(`Exception downloading ${imageUrl}:`, error);
    return null;
  }
}

async function compressImage(imageBuffer) {
  try {
    return await sharp(imageBuffer)
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: JPEG_QUALITY, progressive: true })
      .toBuffer();
  } catch (error) {
    logger.error('Compress error:', error);
    return null;
  }
}

async function uploadToGCS(imageBuffer, filename, contentType = 'image/jpeg') {
  try {
    const storage = new Storage();
    const bucket = storage.bucket(BUCKET_NAME);
    const blob = bucket.file(`properties/${filename}`);

    await blob.save(imageBuffer, {
      contentType: contentType,
      metadata: {
        cacheControl: 'public, max-age=31536000'
      }
    });

    await blob.makePublic();

    return `https://storage.googleapis.com/${BUCKET_NAME}/properties/${filename}`;
  } catch (error) {
    logger.error(`Upload error for ${filename}:`, error);
    return null;
  }
}

// --- Token Management ---
async function getTrestleToken() {
  if (_tokenLock) {
    logger.info('Token request already in progress, waiting...');
    // Wait for the current token request to complete
    while (_tokenLock) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return _currentAccessToken !== null;
  }

  _tokenLock = true;
  logger.info('Starting get_trestle_token function');

  try {
    const payload = new URLSearchParams({
      'client_id': TRESTLE_CLIENT_ID,
      'client_secret': TRESTLE_CLIENT_SECRET,
      'grant_type': 'client_credentials',
      'scope': 'api'
    });

    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    logger.info(`Token URL: ${TOKEN_URL}`);
    logger.info('About to make API request');

    const response = await axios.post(TOKEN_URL, payload, {
      headers,
      timeout: TIMEOUT_SECONDS * 1000
    });

    logger.info(`Response status code: ${response.status}`);
    logger.info(`Response: ${JSON.stringify(response.data)}`);

    const tokenData = response.data;
    const accessToken = tokenData.access_token;
    const expiresInSeconds = tokenData.expires_in;

    if (accessToken && expiresInSeconds) {
      const now = new Date();
      _currentAccessToken = accessToken;
      _tokenExpiresAt = new Date(now.getTime() + expiresInSeconds * 1000);
      logger.info(`Token obtained/renewed. Valid until: ${_tokenExpiresAt}`);
      _tokenLock = false;
      return true;
    } else {
      logger.error('ERROR: Token or expires_in not found.');
      _tokenLock = false;
      return false;
    }
  } catch (error) {
    if (error.response) {
      logger.error(`Error fetching token: ${error}, Response: ${JSON.stringify(error.response.data)}`);
    } else {
      logger.error(`Network error fetching token:`, error);
    }
    _tokenLock = false;
    return false;
  }
}

async function processImageUpload(imageUrl) {
  const imageBuffer = await downloadImage(imageUrl);
  if (!imageBuffer) {
    return null;
  }

  const compressed = await compressImage(imageBuffer);
  if (!compressed) {
    return null;
  }

  let filename = imageUrl.split('/').pop().split('?')[0];
  logger.info(`Processing image: ${imageUrl}`);

  if (!filename.toLowerCase().endsWith('.jpg')) {
    filename += '.jpg';
  }

  const publicUrl = await uploadToGCS(compressed, filename);
  if (publicUrl) {
    logger.info(`Uploaded: ${publicUrl}`);
  }

  return publicUrl;
}

async function ensureValidToken() {
  logger.info('Starting ensure_valid_token function');
  const now = new Date();
  logger.info(`Current token: ${_currentAccessToken}, Expires at: ${_tokenExpiresAt}, Now: ${now}`);

  if (!_currentAccessToken || !_tokenExpiresAt || (_tokenExpiresAt.getTime() - now.getTime()) <= _tokenRefreshThreshold) {
    logger.info('Token missing or expiring soon. Requesting new token...');
    return await getTrestleToken();
  }

  logger.info('Token is still valid');
  return true;
}

// --- Process Listing Sequential (Images uploaded one by one) ---
async function processListingSequential(listing, isNewListing) {
  const listingKey = getSafe(listing, 'ListingKey');
  if (!listingKey) {
    logger.warning('Listing without ListingKey. Skipping.');
    return null;
  }

  logger.info(`Processing listing ${listingKey} sequentially`);

  let mainImageUrl = '';

  // Determine how many images already exist for this listing
  const existingImagesCount = await mongoImages.countDocuments({ 'listing_key': listingKey });

  // Extract image URLs from the listing
  const mediaItems = getSafe(listing, 'Media', []);
  const imageUrls = mediaItems
    .filter(media => 'MediaURL' in media)
    .map(media => media.MediaURL);

  // Only crawl/upload images if there are less than 10 images in DB for this listing
  if (existingImagesCount < 10) {
    // Determine how many more images we can upload (max 10 per listing)
    const numToUpload = 10 - existingImagesCount;

    // Get the URLs of images that are not already in DB
    // First, get all image URLs already in DB for this listing
    const existingImagesResult = await mongoImages.find({ 'listing_key': listingKey }).toArray();
    const existingImageUrls = new Set(existingImagesResult.map(img => img.image_url || ''));

    // We'll upload up to numToUpload images that are not already in DB
    let uploadedCount = 0;

    for (let idx = 0; idx < imageUrls.length && uploadedCount < numToUpload; idx++) {
      const url = imageUrls[idx];
      const gcpUrl = await processImageUpload(url);

      if (gcpUrl && !existingImageUrls.has(gcpUrl)) {
        try {
          await mongoImages.insertOne({
            'listing_key': listingKey,
            'image_url': gcpUrl,
            'uploaded': true
          });

          logger.info(`Inserted image ${uploadedCount + 1} into database for listing ${listingKey}`);

          if (uploadedCount === 0) {
            mainImageUrl = gcpUrl;
          }

          uploadedCount++;
        } catch (error) {
          logger.error(`MongoDB error (listing_images insert):`, error);
        }
      }
    }
  } else {
    // For listings with >= 10 images, get the main image URL from the database
    const existingImage = await mongoImages.findOne({ 'listing_key': listingKey });
    if (existingImage) {
      mainImageUrl = existingImage.image_url || '';
    }
  }

  const doc = {
    'listing_key': String(listingKey),
    'listing_id': getSafe(listing, 'ListingId'),
    'list_price': getSafe(listing, 'ListPrice', 0),
    'original_list_price': getSafe(listing, 'OriginalListPrice', 0),
    'previous_list_price': getSafe(listing, 'PreviousListPrice', 0),
    'lease_amount': getSafe(listing, 'LeaseAmount', 0),
    'address': getSafe(listing, 'UnparsedAddress'),
    'city': getSafe(listing, 'City'),
    'county': getSafe(listing, 'CountyOrParish'),
    'postal_code': getSafe(listing, 'PostalCode'),
    'latitude': getSafe(listing, 'Latitude', 0.0),
    'longitude': getSafe(listing, 'Longitude', 0.0),
    'property_type': getSafe(listing, 'PropertyType'),
    'property_sub_type': getSafe(listing, 'PropertySubType'),
    'bedrooms': getSafe(listing, 'BedroomsTotal', 0),
    'bathrooms': getSafe(listing, 'BathroomsTotalInteger', 0),
    'rooms_total': getSafe(listing, 'RoomsTotal'),
    'living_area_sqft': getSafe(listing, 'LivingArea', 0),
    'lot_size_sqft': getSafe(listing, 'LotSizeSquareFeet', 0),
    'status': getSafe(listing, 'SaleOrLeaseIndicator'),
    'highschool': getSafe(listing, 'HighSchool'),
    'cooling': getSafe(listing, 'Cooling'),
    'heating': getSafe(listing, 'Heating'),
    'HeatingYN': getSafe(listing, 'HeatingYN'),
    'stories': getSafe(listing, 'Stories'),
    'accessibility_features': getSafe(listing, 'AccessibilityFeatures'),
    'interior_features': getSafe(listing, 'InteriorFeatures'),
    'garage_yn': getSafe(listing, 'GarageYN'),
    'garage_size': getSafe(listing, 'GarageSpaces'),
    'door_features': getSafe(listing, 'DoorFeatures'),
    'laundry_features': getSafe(listing, 'LaundryFeatures'),
    'parking_features': getSafe(listing, 'ParkingFeatures'),
    'exterior_features': getSafe(listing, 'ExteriorFeatures'),
    'patio_and_porch_features': getSafe(listing, 'PatioAndPorchFeatures'),
    'security_features': getSafe(listing, 'SecurityFeatures'),
    'pool_features': getSafe(listing, 'PoolFeatures'),
    'roof_features': getSafe(listing, 'RoofFeatures'),
    'parking_total': getSafe(listing, 'ParkingTotal'),
    'year_built': getSafe(listing, 'YearBuilt'),
    'zoning': getSafe(listing, 'ZoningDescription'),
    'standard_status': getSafe(listing, 'StandardStatus'),
    'mls_status': getSafe(listing, 'MlsStatus'),
    'days_on_market': getSafe(listing, 'DaysOnMarket', 0),
    'listing_contract_date': getSafe(listing, 'ListingContractDate'),
    'neighborhood': getSafe(listing, 'SubdivisionName'),
    'public_remarks': getSafe(listing, 'PublicRemarks'),
    'subdivision_name': getSafe(listing, 'SubdivisionName'),
    'main_image_url': mainImageUrl,
    'list_agent_full_name': getSafe(listing, 'ListAgentFullName'),
    'list_office_name': getSafe(listing, 'ListOfficeName'),
    'list_agent_email': getSafe(listing, 'ListAgentEmail'),
    'list_agent_phone': getSafe(listing, 'ListAgentDirectPhone'),
    'lease_considered': getSafe(listing, 'LeaseConsideredYN', false),
    'lease_amount_frequency': getSafe(listing, 'LeaseAmountFrequency'),
    'modification_timestamp': getSafe(listing, 'ModificationTimestamp'),
    'on_market_timestamp': getSafe(listing, 'OnMarketTimestamp'),
    'agent_phone': getSafe(listing, 'ListAgentOfficePhone'),
    'agent_email': getSafe(listing, 'ListAgentEmail'),
    'agent_office_email': getSafe(listing, 'ListOfficeEmail'),
    'agent_office_phone': getSafe(listing, 'ListOfficePhone'),
    'ListAgentLastName': getSafe(listing, 'ListAgentLastName'),
    'ListAgentURL': getSafe(listing, 'ListAgentURL'),
    'possible_use': getSafe(listing, 'PossibleUse'),
    'price_change_timestamp': getSafe(listing, 'PriceChangeTimestamp'),
    'virtual_url': getSafe(listing, 'VirtualTourURLUnbranded'),
    'view': getSafe(listing, 'View'),
    'utilities': getSafe(listing, 'Utilities'),
    'lot_features': getSafe(listing, 'LotFeatures'),
    'showing_contact_name': getSafe(listing, 'ShowingContactName'),
    'current_price': getSafe(listing, 'CurrentPrice'),
    'rent_control_yn': getSafe(listing, 'RentControlYN'),
    'rent_includes': getSafe(listing, 'RentIncludes'),
    'pets_allowed': getSafe(listing, 'PetsAllowed'),
    'land_lease_amount': getSafe(listing, 'LandLeaseAmount'),
    'land_lease_amount_frequency': getSafe(listing, 'LandLeaseAmountFrequency'),
    'available_lease_type': getSafe(listing, 'AvailableLeaseType'),
    'showing_days': getSafe(listing, 'ShowingDays'),
    'showing_instructions': getSafe(listing, 'ShowingInstructions'),
    'showing_contact_phone': getSafe(listing, 'ShowingContactPhone'),
    'showing_requirements': getSafe(listing, 'ShowingRequirements'),
    'start_showing_date': getSafe(listing, 'StartShowingDate'),
    'end_showing_time': getSafe(listing, 'ShowingEndTime'),
    'showing_start_time': getSafe(listing, 'ShowingStartTime'),
    'other_info': Object.entries(listing)
      .filter(([key, value]) => key !== 'Media' && value)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {})
  };

  logger.info(`Completed processing listing ${listingKey}`);
  return doc;
}

// --- Fetch a Single Page with Rate Limiting ---
async function fetchPage(url, headers, params = null) {
  logger.info(`Fetching page: ${url}`);

  try {
    const config = { headers, timeout: TIMEOUT_SECONDS * 1000 };
    if (params) {
      config.params = params;
    }

    const response = await axios.get(url, config);
    return response.data;
  } catch (error) {
    logger.error(`Error fetching page: ${url}`, error);
    throw error;
  }
}

// --- Fetch Listings Concurrently ---
async function getAllActiveListings(lastCrawlTime = null) {
  if (!await ensureValidToken()) {
    logger.error('ERROR: Token could not be obtained.');
    return [];
  }

  // Only get properties updated within the last 15 minutes or specified time
  let timeFilter;
  if (lastCrawlTime) {
    timeFilter = `ModificationTimestamp gt ${lastCrawlTime.toISOString()}`;
  } else {
    const fifteenMinutesAgo = new Date();
    fifteenMinutesAgo.setDate(fifteenMinutesAgo.getDate() - 10); // 10 days ago instead of 15 minutes for initial load
    timeFilter = `ModificationTimestamp gt ${fifteenMinutesAgo.toISOString()}`;
  }

  // Remove county filter to get all counties
  const filterQuery = `${timeFilter}`;  // Remove Active status filter to get all statuses

  const params = {
    '$filter': filterQuery,
    '$expand': 'Media',
    '$top': API_PAGE_SIZE
  };

  const headers = { 'Authorization': `Bearer ${_currentAccessToken}` };
  const baseUrl = `${API_BASE_URL}/Property`;

  const allListings = [];
  let pageCount = 0;
  const nextUrls = [baseUrl];
  const rateLimitDelay = 1000 / RATE_LIMIT_PER_SECOND;

  while (nextUrls.length > 0 && pageCount < API_MAX_PAGES) {
    const batchUrls = nextUrls.splice(0, CONCURRENT_REQUESTS);
    const batchPromises = [];

    for (const url of batchUrls) {
      // Add rate limiting delay between requests
      await new Promise(resolve => setTimeout(resolve, rateLimitDelay));

      batchPromises.push(
        fetchPage(
          url,
          headers,
          url === baseUrl ? params : null
        ).catch(error => error)
      );
    }

    const pageResults = await Promise.all(batchPromises);

    for (const result of pageResults) {
      if (result instanceof Error) {
        logger.error(`Error fetching page:`, result);
        continue;
      }

      const listings = result.value || [];
      allListings.push(...listings);
      pageCount++;

      logger.info(`Page ${pageCount}: Fetched ${listings.length} listings (Total: ${allListings.length})`);

      const nextUrl = result['@odata.nextLink'];
      if (nextUrl) {
        nextUrls.push(nextUrl);
      }
    }

    // Delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
  }

  logger.info(`Retrieved ${allListings.length} listings updated within specified timeframe over ${pageCount} pages.`);
  return allListings;
}

// --- Insert or Update Listings in MongoDB ---
async function insertOrUpdateListingInMongoDB(listing) {
  // If MongoDB is not connected, just log and return
  if (!mongoClient || !mongoDB) {
    logger.info(`MongoDB not available. Would have processed listing ${listing.listing_key}`);
    return;
  }

  try {
    const listingKey = listing.listing_key;
    const standardStatus = listing.standard_status;

    if (standardStatus !== 'Active') {
      // Delete the listing if it's not active
      const images = await mongoImages.find({ 'listing_key': listingKey }).toArray();

      // Delete images from GCP bucket
      const storage = new Storage();
      const bucket = storage.bucket(GCP_BUCKET_NAME);
      const extraUrls = images.map(img => img.image_url || '');

      for (const url of extraUrls) {
        let blobName = null;

        const prefixes = [
          `https://storage.googleapis.com/${BUCKET_NAME}/`,
          `https://storage.cloud.google.com/${BUCKET_NAME}/`
        ];

        for (const prefix of prefixes) {
          if (url.startsWith(prefix)) {
            blobName = url.substring(prefix.length);
            break;
          }
        }

        // If not matched with prefixes, try to extract after "/real-estate-images/"
        if (!blobName && url.includes('/real-estate-images/')) {
          blobName = url.split('/real-estate-images/')[1];
        }

        // If we couldn't determine the blob name, skip
        if (!blobName) continue;

        try {
          const blob = bucket.file(blobName);
          await blob.delete();
          console.log(`Deleted blob: ${blobName}`);
        } catch (error) {
          console.error(`Error deleting blob ${blobName}:`, error);
        }
      }

      logger.info(`Deleted inactive listing ${listingKey} and its images`);

      // Delete from MongoDB
      await mongoListings.deleteOne({ 'listing_key': listingKey });
      await mongoImages.deleteMany({ 'listing_key': listingKey });
    } else {
      // Only update non-image fields, images are in listing_images collection
      const updateFields = { ...listing };
      delete updateFields.images;

      await mongoListings.updateOne(
        { 'listing_key': listingKey },
        {
          '$set': updateFields,
          '$currentDate': { 'last_crawled': true }
        },
        { upsert: true }
      );

      logger.info(`Inserted/updated listing ${listingKey} (info only, images in listing_images)`);
    }
  } catch (error) {
    logger.error(`MongoDB error (listings):`, error);
  }
}

async function storeImageInMongoDB(listingKey, imageUrl, imageData, imageType) {
  // If MongoDB is not connected, just log and return
  if (!mongoClient || !mongoDB) {
    logger.info(`MongoDB not available. Would have stored image for listing ${listingKey}`);
    return;
  }

  try {
    const imageDoc = {
      listing_key: listingKey,
      image_url: imageUrl,
      image_type: imageType,
      image_data: imageData,
      created_at: new Date()
    };

    await mongoImages.updateOne(
      { 'listing_key': listingKey, 'image_url': imageUrl },
      { '$set': imageDoc },
      { upsert: true }
    );

    logger.info(`Stored image for listing ${listingKey}`);
  } catch (error) {
    logger.error(`MongoDB error (images):`, error);
  }
}

// --- Process Listings Sequentially ---
async function processListingsSequentially(listings) {
  const processedListings = [];

  // Get all listing keys
  const listingKeys = listings.map(listing => getSafe(listing, 'ListingKey')).filter(Boolean);

  // Get existing listings from database
  const existingListingsResult = await mongoListings.find(
    { 'listing_key': { '$in': listingKeys } },
    { projection: { 'listing_key': 1 } }
  ).toArray();

  const existingListings = new Set(existingListingsResult.map(doc => doc.listing_key));

  const totalListings = listings.length;
  for (let idx = 0; idx < totalListings; idx++) {
    logger.info(`Processing listing ${idx + 1}/${totalListings}`);
    const listing = listings[idx];
    const listingKey = getSafe(listing, 'ListingKey');

    // Check if this is a new listing
    const isNewListing = !existingListings.has(listingKey);

    const processedListing = await processListingSequential(listing, isNewListing);
    if (processedListing) {
      processedListings.push(processedListing);
    }
  }

  return processedListings;
}

// --- Crawl and Process ---
async function crawlAndProcess(lastCrawlTime = null) {
  try {
    logger.info('Starting crawl cycle - fetching properties updated within specified timeframe');
    let totalProcessed = 0;
    const totalErrors = 0;

    // Fetch all listings concurrently
    const allListings = await getAllActiveListings(lastCrawlTime);
    if (!allListings || allListings.length === 0) {
      logger.info('No listings updated within the specified timeframe.');
      return;
    }

    // Process listings sequentially
    logger.info(`Processing ${allListings.length} recently updated listings sequentially`);
    const processedListings = await processListingsSequentially(allListings);
    totalProcessed += processedListings.length;
    logger.info(`Processed ${processedListings.length} listings`);

    // Insert or update listings in MongoDB sequentially
    for (let idx = 0; idx < processedListings.length; idx++) {
      logger.info(`Saving listing ${idx + 1}/${processedListings.length} to database`);
      await insertOrUpdateListingInMongoDB(processedListings[idx]);
    }

    logger.info(`Crawl cycle completed. Processed: ${totalProcessed}, Errors: ${totalErrors}`);
  } catch (error) {
    logger.critical(`Crawl cycle error:`, error);
  }
}

// --- Main Execution with Scheduler ---
async function main() {
  await connectToMongoDB();

  let lastCrawlTime = null;

  // Define the scheduled task
  const scheduledTask = async () => {
    await crawlAndProcess(lastCrawlTime);
    lastCrawlTime = new Date();
  };

  // Schedule the task to run every 30 minutes
  const job = schedule.scheduleJob('*/30 * * * *', scheduledTask);

  logger.info('Scheduler started. Crawling every 30 minutes for recently updated properties.');

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    job.cancel();
    logger.info('Scheduler stopped.');

    if (mongoClient) {
      await mongoClient.close();
      logger.info('MongoDB connection closed.');
    }

    process.exit(0);
  });
}

// For one-shot crawling
// (async () => {
//   await connectToMongoDB();
//   await crawlAndProcess();
//   await mongoClient.close();
// })();

// For scheduled crawling
if (require.main === module) {
  main().catch(error => {
    logger.critical('Error in main function:', error);
    process.exit(1);
  });
}

module.exports = {
  connectToMongoDB,
  crawlAndProcess,
  processImageUpload,
  ensureValidToken,
  getAllActiveListings,
  processListingSequential,
  insertOrUpdateListingInMongoDB
};
