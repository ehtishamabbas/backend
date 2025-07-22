const express = require('express');
const router = express.Router();
const { validateRequestMiddleware } = require('../middleware/security');
const { getCollections } = require('../config/database');
const {
  convertObjectId,
  buildListingsQuery,
  getListingsProjection,
  fetchImagesForListings
} = require('../models/listings');

router.get('/', validateRequestMiddleware({
  city: { type: 'string', max: 100, required: false },
  county: { type: 'string', max: 100, required: false },
  min_price: { type: 'number', min: 0, required: false },
  max_price: { type: 'number', min: 0, required: false },
  property_type: { type: 'string', max: 100, required: false },
  min_bedrooms: { type: 'number', min: 0, required: false },
  min_bathrooms: { type: 'number', min: 0, required: false },
  year_built: { type: 'number', min: 1800, required: false },
  skip: { type: 'number', min: 0, required: false },
  limit: { type: 'number', min: 1, max: 1000, required: false },
  // eslint-disable-next-line max-len
  sort_by: { type: 'string', enum: ['recommended', 'date-desc', 'price-asc', 'price-desc', 'area-desc'], required: false }
}), async (req, res) => {
  try {
    const collections = getCollections();

    // Parse query parameters
    const city = req.query.city;
    const county = req.query.county;
    const minPrice = req.query.min_price ? parseFloat(req.query.min_price) : null;
    const maxPrice = req.query.max_price ? parseFloat(req.query.max_price) : null;
    const propertyType = req.query.property_type;
    const minBedrooms = req.query.min_bedrooms ? parseInt(req.query.min_bedrooms, 10) : null;
    const minBathrooms = req.query.min_bathrooms ? parseInt(req.query.min_bathrooms, 10) : null;
    const yearBuilt = req.query.year_built ? parseInt(req.query.year_built, 10) : null;
    const skip = req.query.skip ? parseInt(req.query.skip, 10) : 0;
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
    const sortBy = req.query.sort_by || 'recommended';

    // Build query
    const { query, seoQuery } = buildListingsQuery(
      city, county, minPrice, maxPrice, propertyType, minBedrooms, minBathrooms, yearBuilt
    );

    // Set sort order
    let sort = {};
    if (sortBy === 'date-desc') {
      sort = { list_date: -1 };
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
    const totalItems = await collections.listings.countDocuments(query);

    // Get listings
    const projection = getListingsProjection();
    const listings = await collections.listings.find(query)
      .project(projection)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .toArray();

    // Get listing keys for image lookup
    const listingKeys = listings.map(listing => listing.listing_key);

    // Fetch images for listings
    const imagesMap = await fetchImagesForListings(listingKeys);

    // Get SEO content if applicable
    let seoResult = null;
    if (Object.keys(seoQuery).length > 0) {
      const seoContent = await collections.seoContent.findOne(seoQuery);
      if (seoContent) {
        seoResult = {
          title: seoContent.title || '',
          faq_content: seoContent.faq_content || '',
          seo_title: seoContent.seo_title || '',
          meta_description: seoContent.meta_description || '',
          h1_heading: seoContent.h1_heading || '',
          page_content: seoContent.page_content || '',
          amenities_content: seoContent.amenities_content || '',
          keywords: seoContent.keywords || []
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
    console.error(`Error fetching listings: ${error}`);
    res.status(500).json({ error: error.message });
  }
});


router.get('/property-type', async (req, res) => {
  try {
    const collections = getCollections();

    const propertyTypes = await collections.listingType.findOne({ type: 'property_type' });
    const propertySubTypes = await collections.listingType.findOne({ type: 'property_sub_type' });

    if (!propertyTypes || !propertySubTypes) {
      return res.status(404).json({ error: 'Property types not found' });
    }

    res.json({
      property_type: convertObjectId(propertyTypes.values),
      property_sub_type: convertObjectId(propertySubTypes.values)
    });
  } catch (error) {
    console.error(`Error fetching property types: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


router.get('/:listingKey', async (req, res) => {
  try {
    const collections = getCollections();
    const listingKey = req.params.listingKey;

    // Get listing
    const listing = await collections.listings.findOne({ listing_key: listingKey });

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    // Get images
    const images = await collections.listingImages.find({ listing_key: listingKey }).toArray();
    listing.images = images.map(img => img.image_url);

    // Get SEO content
    const seoContent = await collections.seoContent.findOne({
      'Location Type': 'City',
      'Location': listing.city
    });

    if (seoContent) {
      listing.title = seoContent.title || '';
      listing.faq_content = seoContent.faq_content || '';
      listing.seo_title = seoContent.seo_title || '';
      listing.meta_description = seoContent.meta_description || '';
      listing.h1_heading = seoContent.h1_heading || '';
      listing.page_content = seoContent.page_content || '';
      listing.amenities_content = seoContent.amenities_content || '';
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
    console.error(`Error fetching listing ${req.params.listingKey}: ${error}`);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
