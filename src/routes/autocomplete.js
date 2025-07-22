import express from 'express';
const router = express.Router();
import { validateRequestMiddleware } from '../middleware/security.js';
import { getCollections } from '../config/database.js';
import { convertObjectId } from '../models/listings.js';


router.get('/', validateRequestMiddleware({
  query: { type: 'string', min: 1, max: 100, required: false }
}), async (req, res) => {
  try {
    const collections = getCollections();
    const query = req.query.query;
    const suggestions = [];

    if (query) {
      // County suggestions
      const countyAggregation = await collections.locations.distinct('county', {
        county: { $regex: new RegExp(query, 'i') }
      });

      suggestions.push(...countyAggregation.map(county => ({
        type: 'county',
        text: county,
        value: county
      })));

      // City suggestions
      const cityAggregation = await collections.locations.distinct('city', {
        city: { $regex: new RegExp(query, 'i') }
      });

      suggestions.push(...cityAggregation.map(city => ({
        type: 'city',
        text: city,
        value: city
      })));

      // Property type suggestions
      const propertyTypes = await collections.listingType.findOne({ type: 'property_type' });
      if (propertyTypes && propertyTypes.values) {
        const matchingTypes = propertyTypes.values.filter(type =>
          type.toLowerCase().includes(query.toLowerCase())
        );

        suggestions.push(...matchingTypes.map(suggestion => ({
          type: 'property_type',
          text: suggestion,
          value: convertObjectId(suggestion)
        })));
      }
    }

    res.json(suggestions);
  } catch (error) {
    console.error(`Error in autocomplete: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
