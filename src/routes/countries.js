import express from 'express';
const router = express.Router();
import { validateRequestMiddleware } from '../middleware/security.js';
import { getCollections } from '../config/database.js';
import { convertObjectId } from '../models/listings.js';


router.get('/images', validateRequestMiddleware({
  country: { type: 'string', required: true },
  city: { type: 'string', required: false }
}), async (req, res) => {
  try {
    const collections = getCollections();
    const country = req.query.country;
    const city = req.query.city;

    let countriesImages;
    if (city) {
      countriesImages = await collections.countriesImages.find({ country, city }).toArray();
    } else {
      countriesImages = await collections.countriesImages.find({ country }).toArray();
    }

    res.json(convertObjectId(countriesImages));
  } catch (error) {
    console.error(`Error fetching countries images: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;
