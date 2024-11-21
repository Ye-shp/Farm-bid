const Product = require('../models/Product');
const User = require('../models/User');

// Function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Radius of Earth in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
}

exports.searchFarms = async (req, res) => {
  const { keyword, category, delivery, wholesale, latitude, longitude, radius = 50 } = req.query;

  try {
    // Step 1: Search products based on keyword and category
    const productQuery = {
      ...(keyword && { $or: [
        { title: { $regex: keyword, $options: 'i' } },
        { customProduct: { $regex: keyword, $options: 'i' } },
      ] }),
      ...(category && { category }),
    };

    const products = await Product.find(productQuery).populate('user');

    // Step 2: Filter by location, delivery, and wholesale
    const filteredProducts = products.filter(product => {
      const farmer = product.user;
      if (!farmer) return false;

      // Location-based filtering
      if (latitude && longitude) {
        const distance = calculateDistance(latitude, longitude, farmer.location.latitude, farmer.location.longitude);
        if (distance > radius) return false;
      }

      // Delivery and wholesale filtering
      if (delivery !== undefined && farmer.deliveryAvailable !== (delivery === 'true')) return false;
      if (wholesale !== undefined && farmer.wholesaleAvailable !== (wholesale === 'true')) return false;

      return true;
    });

    res.json(filteredProducts);
  } catch (error) {
    console.error('Error in searchFarms:', error);
    res.status(500).json({ error: 'Server error during search.' });
  }
};
