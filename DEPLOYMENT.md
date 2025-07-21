# Deployment Guide for Node.js Backend

This guide provides instructions for deploying the Node.js backend to various environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Variables](#environment-variables)
3. [Docker Deployment](#docker-deployment)
4. [Manual Deployment](#manual-deployment)
5. [Cloud Deployment](#cloud-deployment)
6. [Monitoring and Maintenance](#monitoring-and-maintenance)

## Prerequisites

Before deploying, ensure you have:

- Node.js 18.x or higher
- MongoDB 4.4 or higher
- Google Cloud Storage account and credentials (for image storage)
- Trestle API credentials

## Environment Variables

Create a `.env` file based on `.env.example` with the following variables:

```
# Trestle API credentials
TRESTLE_CLIENT_ID=d63ef0f1cad54d3f9046bd8b33cc70e2
TRESTLE_CLIENT_SECRET=851035be936449588b55667346f2d2d4
TOKEN_URL=https://api.trestle.reso.org/token
API_BASE_URL=https://api.trestle.reso.org/odata

# MongoDB configuration
MONGODB_URL=mongodb://localhost:27017
DATABASE_NAME=real_estate
MONGODB_COLLECTION=listings
MONGODB_IMAGES_COLLECTION=images

# Google Cloud Storage
GCP_BUCKET_NAME=your_bucket_name
GOOGLE_APPLICATION_CREDENTIALS=path/to/credentials.json

# API configuration
PORT=3000
API_PAGE_SIZE=10
API_MAX_PAGES=100
BATCH_SIZE=100
MAX_PROCESSING_ERRORS=10
CONCURRENT_REQUESTS=5
RATE_LIMIT_PER_SECOND=5
TIMEOUT_SECONDS=30

# Testing configuration (optional)
PYTHON_API_URL=http://localhost:8000
NODEJS_API_URL=http://localhost:3000
```

## Docker Deployment

The easiest way to deploy is using Docker and docker-compose:

1. Build and start the containers:

```bash
docker-compose up -d
```

2. To scale services:

```bash
docker-compose up -d --scale express=2 --scale crawler=1
```

3. To view logs:

```bash
docker-compose logs -f
```

4. To stop the services:

```bash
docker-compose down
```

### Using Individual Dockerfiles

You can also build and run the services individually:

```bash
# Build API server
docker build -t real-estate-api -f Dockerfile_express .

# Run API server
docker run -d --name real-estate-api -p 3000:3000 --env-file .env real-estate-api

# Build crawler
docker build -t real-estate-crawler -f Dockerfile_crawler .

# Run crawler
docker run -d --name real-estate-crawler --env-file .env real-estate-crawler
```

## Manual Deployment

For manual deployment:

1. Clone the repository:

```bash
git clone <repository-url>
cd back-nodejs
```

2. Install dependencies:

```bash
npm install
```

3. Create and configure the `.env` file as described above.

4. Initialize the database:

```bash
node db_init.js
```

5. Start the API server:

```bash
npm start
```

6. Start the crawler (in a separate terminal):

```bash
npm run crawler
```

## Cloud Deployment

### Google Cloud Run

1. Build and push the Docker image:

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/real-estate-api
```

2. Deploy to Cloud Run:

```bash
gcloud run deploy real-estate-api \
  --image gcr.io/YOUR_PROJECT_ID/real-estate-api \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --set-env-vars="MONGODB_URL=mongodb+srv://..."
```

### AWS Elastic Beanstalk

1. Install the EB CLI:

```bash
pip install awsebcli
```

2. Initialize EB application:

```bash
eb init
```

3. Create an environment:

```bash
eb create real-estate-api-prod
```

4. Deploy:

```bash
eb deploy
```

### Heroku

1. Create a Procfile:

```
web: node index.js --server
worker: node index.js --crawler
```

2. Deploy to Heroku:

```bash
heroku create
git push heroku main
heroku ps:scale web=1 worker=1
```

## Monitoring and Maintenance

### Health Checks

The API provides a `/health` endpoint that returns the status of the service. Use this for monitoring.

### Logs

Logs are stored in the `logs` directory by default. In production, consider using a log aggregation service like ELK Stack, Datadog, or Loggly.

### Database Backups

Schedule regular backups of your MongoDB database:

```bash
mongodump --uri="mongodb://..." --out=/backup/$(date +"%Y-%m-%d")
```

### Updating

To update the application:

1. Pull the latest changes:

```bash
git pull
```

2. Install any new dependencies:

```bash
npm install
```

3. Restart the services:

```bash
pm2 restart all
```

Or with Docker:

```bash
docker-compose pull
docker-compose up -d
```

## Troubleshooting

### Common Issues

1. **Connection to MongoDB fails**:
   - Check if MongoDB is running
   - Verify credentials and connection string
   - Check network connectivity

2. **API returns 500 errors**:
   - Check logs for detailed error messages
   - Verify all environment variables are set correctly
   - Ensure Google Cloud Storage credentials are valid

3. **Crawler not working**:
   - Check Trestle API credentials
   - Verify rate limits and concurrent requests settings
   - Check logs for API-specific errors

For more help, refer to the logs or open an issue on the repository.
