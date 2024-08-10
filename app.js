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

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
