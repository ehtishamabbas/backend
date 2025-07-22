const express = require('express');
const router = express.Router();
const { validateRequestMiddleware } = require('../middleware/security');
const { getCollections } = require('../config/database');
const { convertObjectId } = require('../models/listings');
const logger = require('../utils/logger');

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
router.get('/images', validateRequestMiddleware({
  county: { type: 'string', required: true },
  city: { type: 'string', required: false }
}), async (req, res) => {
  try {
    const collections = getCollections();
    const county = req.query.county;
    const city = req.query.city;

    let countiesImages;
    if (city) {
      countiesImages = await collections.countiesImages.find({ county, city }).toArray();
    } else {
      countiesImages = await collections.countiesImages.find({ county }).toArray();
    }

    res.json(convertObjectId(countiesImages));
  } catch (error) {
    logger.error(`Error fetching counties images: ${error}`);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
