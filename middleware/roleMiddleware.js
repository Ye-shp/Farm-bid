const { authMiddleware, roleMiddleware } = require('./middleware/authMiddleware');

// Route accessible only by farmers
app.get('/api/farmer-data', authMiddleware, roleMiddleware('farmer'), farmerController.getFarmerData);

// Route accessible only by buyers
app.get('/api/buyer-data', authMiddleware, roleMiddleware('buyer'), buyerController.getBuyerData);
