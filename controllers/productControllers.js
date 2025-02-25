const AWS = require('aws-sdk');
const {Product, productCategories, allowedCategories, allowedProducts }= require('../models/Product');
const Auction = require('../models/Product');
const Order = require('../models/Order');
const multer = require('multer');
const multerS3 = require('multer-s3');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

// Multer setup to upload directly to S3
const upload = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.S3_BUCKET_NAME,
    key: function (req, file, cb) {
      cb(null, Date.now().toString() + '-' + file.originalname);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit files to 5MB
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  },
});

exports.getproductCategories = (req, res) => {
  try {
    res.json(productCategories);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ error: 'Server error fetching product categories' });
  }
};

exports.getallowedCategories = async (req,res)=>{
  res.json(allowedCategories);
};
exports.getallowedProducts = async (req,res)=>{
  res.json(allowedProducts);
};

// Updated productDetails controller with technical specs
exports.productDetails = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId)
      .select('title customProduct category totalQuantity description imageUrl status createdAt user certifications productSpecs productionPractices')
      .lean();

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Enhanced response with technical data
    const responseData = {
      ...product,
      displayName: product.title || product.customProduct,
      stockStatus: product.totalQuantity > 0 ? 'In Stock' : 'Out of Stock',
      lastUpdated: product.createdAt,
      isOwner: false,
      technicalSpecs: {
        certifications: product.certifications,
        productDetails: product.productSpecs,
        productionInfo: product.productionPractices
      }
    };

    // Add ownership flag if authenticated
    if (req.user && product.user.toString() === req.user.id) {
      responseData.isOwner = true;
      // Include raw technical data for owners
      responseData.rawTechnicalData = {
        certifications: product.certifications,
        productSpecs: product.productSpecs,
        productionPractices: product.productionPractices
      };
    }

    res.json(responseData);

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Updated createProduct controller with technical specs handling
exports.createProduct = [
  upload.single('image'),
  async (req, res) => {
    try {
      // Parse technical specifications from JSON strings
      const technicalData = {
        certifications: req.body.certifications ? JSON.parse(req.body.certifications) : undefined,
        productSpecs: req.body.productSpecs ? JSON.parse(req.body.productSpecs) : undefined,
        productionPractices: req.body.productionPractices ? JSON.parse(req.body.productionPractices) : undefined
      };

      const { category, title, customProduct, description } = req.body;
      const totalQuantity = Number(req.body.totalQuantity);

      // Validate user
      if (!req.user?.id) return res.status(401).json({ error: 'Unauthorized' });

      // Validate category
      if (!allowedCategories.includes(category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }

      // Validate quantity
      if (isNaN(totalQuantity) || totalQuantity <= 0 || totalQuantity > 1000000) {
        return res.status(400).json({ error: 'Invalid quantity' });
      }

      // Validate title/custom product
      if (!title && !customProduct) {
        return res.status(400).json({ error: 'Product name required' });
      }
      if (title && customProduct) {
        return res.status(400).json({ error: 'Ambiguous product naming' });
      }
      if (title && !allowedProducts.includes(title)) {
        return res.status(400).json({ error: 'Invalid product title' });
      }

      // Create new product with technical specs
      const newProduct = new Product({
        category,
        title,
        customProduct,
        description,
        imageUrl: req.file?.location || 'https://example.com/default-image.jpg',
        user: req.user.id,
        totalQuantity,
        status: 'Approved',
        ...technicalData
      });

      await newProduct.save();
      res.status(201).json(newProduct);

    } catch (error) {
      console.error('Product creation error:', error);
      
      // Handle JSON parsing errors
      if (error instanceof SyntaxError) {
        return res.status(400).json({ error: 'Invalid technical specifications format' });
      }

      // Handle Mongoose validation errors
      if (error.name === 'ValidationError') {
        const errors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json({ errors });
      }

      res.status(500).json({ error: 'Server error' });
    }
  },
];
   
// Updated getFarmerProducts with technical data filtering
exports.getFarmerProducts = async (req, res) => {
  try {
    const farmerId = req.query.farmerId || req.user.id;
    const products = await Product.find({ user: farmerId })
      .select('title category totalQuantity status certifications productSpecs productionPractices');

    const formattedProducts = products.map(product => ({
      ...product.toObject(),
      technicalSpecs: {
        hasCertifications: !!product.certifications,
        hasProductionData: !!product.productionPractices,
        hasProductSpecs: !!product.productSpecs
      }
    }));

    res.json(formattedProducts);
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ error: err.message });
  }
};


// use this later when we start manually approving products
exports.approveProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    product.status = 'Approved';
    await product.save();

    res.json({ message: 'Product approved successfully', product });
  } catch (err) {
    console.error('Error approving product:', err);
    res.status(500).json({ message: 'Failed to approve product', error: err.message });
  }
};

// Helper Functions
async function calculateAuctionMetrics(productId, startDate, endDate) {
    try {
        const auctionHistory = await Auction.find({
            product: productId,
            createdAt: { $gte: startDate, $lte: endDate }
        }).populate('bids.user', 'name location');

        const activeAuctions = await Auction.countDocuments({
            product: productId,
            status: 'active',
            endTime: { $gte: new Date() }
        });

        const totalAuctions = auctionHistory.length;
        const completedAuctions = auctionHistory.filter(a => a.status === 'ended');
        const successfulAuctions = completedAuctions.filter(a => a.winningBid);
        
        const successRate = completedAuctions.length > 0 
            ? (successfulAuctions.length / completedAuctions.length) * 100 
            : 0;

        const averageBidsPerAuction = auctionHistory.reduce((acc, auction) => 
            acc + (auction.bids ? auction.bids.length : 0), 0) / Math.max(totalAuctions, 1);

        return {
            activeAuctions,
            auctionHistory,
            totalAuctions,
            successRate,
            averageBidsPerAuction,
            highestBid: calculateHighestBid(auctionHistory),
            bidVelocity: calculateBidVelocity(auctionHistory),
            optimalDuration: calculateOptimalDuration(auctionHistory),
            demandRate: calculateDemandTrend(auctionHistory)
        };
    } catch (error) {
        console.error('Auction Metrics Error:', error);
        throw new Error('Failed to calculate auction metrics');
    }
}

async function calculateOrderMetrics(productId, startDate, endDate) {
    try {
        const orderHistory = await Order.find({
            auction: { $in: await Auction.find({ product: productId }).select('_id') },
            createdAt: { $gte: startDate, $lte: endDate }
        }).populate('buyer', 'name location');

        const totalOrders = orderHistory.length;
        const totalRevenue = orderHistory.reduce((sum, order) => sum + order.amount, 0);
        const fulfillmentRate = orderHistory.filter(order => 
            order.status === 'fulfilled').length / Math.max(totalOrders, 1) * 100;

        return {
            orderHistory,
            totalOrders,
            totalRevenue,
            averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
            fulfillmentRate,
            paymentSuccessRate: calculatePaymentSuccessRate(orderHistory),
            orderTrends: analyzeOrderTrends(orderHistory)
        };
    } catch (error) {
        console.error('Order Metrics Error:', error);
        throw new Error('Failed to calculate order metrics');
    }
}

exports.getproductAnalytics = async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Helper functions
    const calculateAuctionMetrics = async (productId, startDate, endDate) => {
      const auctionHistory = await Auction.find({
        product: productId,
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('bids.user', 'name location');

      const activeAuctions = await Auction.countDocuments({
        product: productId,
        status: 'active',
        endTime: { $gte: new Date() }
      });

      const totalAuctions = auctionHistory.length;
      const completedAuctions = auctionHistory.filter(a => a.status === 'ended');
      const successfulAuctions = completedAuctions.filter(a => a.winningBid);
      
      const successRate = completedAuctions.length > 0 
        ? (successfulAuctions.length / completedAuctions.length) * 100 
        : 0;

      return {
        activeAuctions,
        auctionHistory,
        totalAuctions,
        successRate,
        averageBidsPerAuction: auctionHistory.reduce((acc, auction) => 
          acc + (auction.bids?.length || 0), 0) / Math.max(totalAuctions, 1)
      };
    };

    const calculateOrderMetrics = async (productId, startDate, endDate) => {
      const orderHistory = await Order.find({
        auction: { $in: await Auction.find({ product: productId }).select('_id') },
        createdAt: { $gte: startDate, $lte: endDate }
      }).populate('buyer', 'name location');

      const totalOrders = orderHistory.length;
      const totalRevenue = orderHistory.reduce((sum, order) => sum + order.amount, 0);

      return {
        orderHistory,
        totalOrders,
        totalRevenue,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        fulfillmentRate: orderHistory.filter(order => 
          order.status === 'fulfilled').length / Math.max(totalOrders, 1) * 100
      };
    };

    // Main controller logic
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        status: 'fail',
        message: 'Product not found'
      });
    }

    if (product.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        status: 'fail',
        message: 'Unauthorized access to product analytics'
      });
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (req.query.days || 30));

    const [auctionMetrics, orderMetrics] = await Promise.all([
      calculateAuctionMetrics(productId, startDate, endDate),
      calculateOrderMetrics(productId, startDate, endDate)
    ]);

    const analytics = {
      timeframe: { start: startDate, end: endDate },
      overview: {
        totalRevenue: auctionMetrics.totalAuctions + orderMetrics.totalRevenue,
        averagePrice: orderMetrics.totalRevenue / orderMetrics.totalOrders || 0,
        currentStock: product.totalQuantity,
        activeAuctions: auctionMetrics.activeAuctions
      },
      auctions: {
        ...auctionMetrics,
        successRate: `${auctionMetrics.successRate.toFixed(1)}%`
      },
      orders: {
        ...orderMetrics,
        fulfillmentRate: `${orderMetrics.fulfillmentRate.toFixed(1)}%`
      }
    };

    res.status(200).json({
      status: 'success',
      data: analytics
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate product analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.updateInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity, reason, location, notes } = req.body;

    // Validate required fields
    if (!quantity || !reason) {
      return res.status(400).json({ 
        message: 'Quantity and reason are required' 
      });
    }

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Verify ownership
    if (product.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Validate new quantity
    const newTotal = product.totalQuantity + Number(quantity);
    if (newTotal < 0) {
      return res.status(400).json({ message: 'Insufficient stock' });
    }

    // Update total quantity
    product.totalQuantity = newTotal;

    // Add to inventory history with all fields
    product.inventoryHistory.push({
      quantity: Number(quantity),
      reason,
      location: location || '',
      notes: notes || '',
      timestamp: new Date()
    });

    await product.save();

    res.json({ 
      message: 'Inventory updated successfully', 
      currentQuantity: product.totalQuantity,
      lastUpdate: product.inventoryHistory[product.inventoryHistory.length - 1]
    });
  } catch (error) {
    console.error('Inventory update error:', error);
    res.status(500).json({ message: 'Failed to update inventory' });
  }
};

exports.getInventoryHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Verify ownership
    if (product.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    res.json(product.inventoryHistory);
  } catch (error) {
    console.error('Error fetching inventory history:', error);
    res.status(500).json({ message: 'Failed to fetch inventory history' });
  }
};