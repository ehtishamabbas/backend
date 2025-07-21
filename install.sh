#!/bin/bash

# Install script for Node.js backend

echo "Installing dependencies for Node.js backend..."
npm install

echo "Creating .env file from example if it doesn't exist..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo ".env file created. Please update it with your credentials."
else
  echo ".env file already exists."
fi

echo "Creating logs directory if it doesn't exist..."
mkdir -p logs

echo "Installation complete!"
echo "Next steps:"
echo "1. Update your .env file with your credentials"
echo "2. Run 'npm start' to start the API server"
echo "3. Run 'npm run crawler' to run the crawler"
echo "4. Visit http://localhost:3000/api-docs for API documentation"
