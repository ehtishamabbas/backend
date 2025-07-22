import { ObjectId } from 'mongodb';
import { getCollections } from '../config/database.js';

/**
 * Convert ObjectId to string in objects
 * @param {any} obj - Object to convert
 * @returns {any} - Converted object
 */
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

/**
 * Upsert listing in database
 * @param {object} listingData - Listing data
 * @returns {Promise} - Database operation result
 */
function upsertListingInDb(listingData) {
  const collections = getCollections();
  const { images, ...listingWithoutImages } = listingData;

  return collections.listings.findOne({ listing_key: listingData.listing_key })
    .then(existingListing => {
      if (existingListing) {
        return collections.listings.updateOne(
          { listing_key: listingData.listing_key },
          { $set: listingWithoutImages }
        );
      } else {
        return collections.listings.insertOne(listingWithoutImages);
      }
    });
}

/**
 * Update listing images
 * @param {string} listingKey - Listing key
 * @param {Array} images - Array of image URLs
 * @returns {Promise} - Database operation result
 */
function updateListingImages(listingKey, images) {
  const collections = getCollections();

  return collections.listingImages.deleteMany({ listing_key: listingKey })
    .then(() => {
      if (images && images.length > 0) {
        const imageDocs = images.map(url => ({
          listing_key: listingKey,
          image_url: url
        }));
        return collections.listingImages.insertMany(imageDocs);
      }
    });
}

/**
 * Build listings query based on filters
 * @param {string} city - City filter
 * @param {string} county - County filter
 * @param {number} minPrice - Minimum price
 * @param {number} maxPrice - Maximum price
 * @param {string} propertyType - Property type
 * @param {number} minBedrooms - Minimum bedrooms
 * @param {number} minBathrooms - Minimum bathrooms
 * @param {number} yearBuilt - Year built
 * @returns {object} - Query object and SEO query
 */
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

  if (minPrice !== null && minPrice !== undefined) {
    query.list_price = query.list_price || {};
    query.list_price.$gte = minPrice;
  }

  if (maxPrice !== null && maxPrice !== undefined) {
    query.list_price = query.list_price || {};
    query.list_price.$lte = maxPrice;
  }

  return { query, seoQuery };
}

/**
 * Get listings projection
 * @returns {object} - Projection object
 */
function getListingsProjection() {
  return {
    _id: 1,
    listing_key: 1,
    property_id: 1,
    listing_id: 1,
    products: 1,
    list_price: 1,
    list_date: 1,
    last_update_date: 1,
    status: 1,
    street_address: 1,
    city: 1,
    state_code: 1,
    postal_code: 1,
    county: 1,
    description: 1,
    bedrooms: 1,
    bathrooms: 1,
    property_type: 1,
    property_sub_type: 1,
    year_built: 1,
    lot_size_sqft: 1,
    living_area_sqft: 1,
    stories: 1,
    garage: 1,
    pool: 1,
    virtual_tour_url: 1,
    on_market_timestamp: 1
  };
}

/**
 * Fetch images for listings
 * @param {Array} listingKeys - Array of listing keys
 * @returns {Promise<object>} - Map of listing keys to images
 */
async function fetchImagesForListings(listingKeys) {
  const collections = getCollections();

  const images = await collections.listingImages.find({
    listing_key: { $in: listingKeys }
  }).toArray();

  const imagesMap = {};

  for (const image of images) {
    if (!imagesMap[image.listing_key]) {
      imagesMap[image.listing_key] = [];
    }
    imagesMap[image.listing_key].push(image.image_url);
  }

  return imagesMap;
}

export {
  convertObjectId,
  upsertListingInDb,
  updateListingImages,
  buildListingsQuery,
  getListingsProjection,
  fetchImagesForListings
};
