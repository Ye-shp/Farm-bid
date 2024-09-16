const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Import routes
const authRoute = require('./routes/authRoute');
const productRoute = require('./routes/productRoute');
const auctionRoute = require('./routes/auctionRoute');
const blogRoute = require('./routes/blogRoute');

// Use routes
app.use('/api/auth', authRoute);
app.use('/api/products', productRoute);
app.use('/api/auctions', auctionRoute);
app.use('/api/blogs', blogRoute);

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the Farm Bid API');
});

// Connect to MongoDB with enhanced error handling
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
