const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

mongoose.set('debug', true);

// Load environment variables from .env file
dotenv.config();

require('./jobs/cronJobs'); 

const app = express();
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://elipae.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization',
    'Origin',
    'X-Requested-With',
    'Accept',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers',
    'stripe-signature'
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Special handling for Stripe webhook route
app.use('/api/auctions/webhook', express.raw({ type: 'application/json' }));

// For all other routes, parse JSON
app.use((req, res, next) => {
  if (req.originalUrl === '/api/auctions/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Import routes
const authRoute = require('./routes/authRoute');
const productRoute = require('./routes/productRoute');
const auctionRoute = require('./routes/auctionRoute');
const blogRoute = require('./routes/blogRoute');
const userRoute = require('./routes/userRoute')
const notificationRoute = require('./routes/notificationRoute')
const payoutRoute = require('./routes/payoutRoute');
const contractRoute = require('./routes/contractRoute');
const transactionRoute = require('./routes/transactionRoute');
const searchRoute = require ('./routes/searchRoute');
const paymentRoute = require('./routes/paymentRoute'); 
const reviewRoute = require('./routes/reviews'); // Added reviewRoute

//farmer and buyer routes for location-based matching
const farmerRoute = require('./routes/farmerRoute');
const buyerRoute = require('./routes/buyerRoute');

// Use routes
app.use('/api/auth', authRoute);
app.use('/api/products', productRoute);
app.use('/api/auctions', auctionRoute);
app.use('/api/blogs', blogRoute);
app.use('/api/users', userRoute);
app.use('/api/notifications', notificationRoute);
app.use('/api/payout', payoutRoute);
app.use('/api/open-contracts', contractRoute); 
app.use ('/api/transactions', transactionRoute);
app.use ('/api/search', searchRoute);
app.use('/api/payments', paymentRoute); 
app.use('/api/reviews', reviewRoute); // Added reviews route

// Use the new farmer and buyer routes
app.use('/api/farmers', farmerRoute);
app.use('/api/buyers', buyerRoute);

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the Elipae API');
});

// Connect to MongoDB with enhanced error handling
console.log('MONGO_URI:', process.env.MONGO_URI);

mongoose.connect(process.env.MONGO_URI, { })
.then(() => console.log('MongoDB connected successfully'))
  .catch(err => {
    console.error('MongoDB connection error:', err.message);
    process.exit(1); // Exit process with failure
  });

// Error handling for undefined routes
app.use((req, res, next) => {
  res.status(404).json({ message: 'Route not found' });
});

// Global error handler for catching any other errors
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ message: 'An internal server error occurred' });
});

// Add handlers for uncaught exceptions and unhandled rejections
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1); // Exit process with failure
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1); // Exit process with failure
});

// Server running
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
