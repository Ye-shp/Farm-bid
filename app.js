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

// Use routes
app.use('/api/auth', authRoute);
app.use('/api/products', productRoute);
app.use('/api/auctions', auctionRoute);

// Default route
app.get('/', (req, res) => {
  res.send('Welcome to the Farm Bid API');
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

// Error handling for undefined routes
app.use((req, res, next) => {
  res.status(404).send('Route not found');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
