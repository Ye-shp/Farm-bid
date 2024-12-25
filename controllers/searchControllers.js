const {Product, allowedProducts, allowedCategories}= require('../models/Product');
const User = require('../models/User');

// Function to calculate distance 
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; 
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

exports.searchFarms = async (req, res) => {
  const { product, category, delivery, wholesale, latitude, longitude, radius = 50, searchAnywhere } = req.query;
  try {
    console.log('Search params:', { product, category, delivery, wholesale, latitude, longitude, radius, searchAnywhere });
    
    const userLatitude = latitude ? parseFloat(latitude) : null;
    const userLongitude = longitude ? parseFloat(longitude) : null;
    const searchRadius = radius ? parseFloat(radius) : 50; // Default to 50 km

    const deliveryFilter = delivery === 'true' ? true : delivery === 'false' ? false : null;
    const wholesaleFilter = wholesale === 'true' ? true : wholesale === 'false' ? false : null;

    if (product && !allowedProducts.includes(product)) {
      return res.status(400).json({ error: 'Invalid product selected.' });
    }

    if (category && !allowedCategories.includes(category)) {
      return res.status(400).json({ error: 'Invalid category selected.' });
    }

    const productQuery = {
      status: 'Approved',
      ...(product && { $or: [{ title: product }, { customProduct: product }] }),
      ...(category && { category }),
    };

    console.log('Product query:', productQuery);

    const products = await Product.find(productQuery).populate('user');
    console.log('Found products before filtering:', products.length);

    const filteredProducts = products.filter((product) => {
      const farmer = product.user;
      if (!farmer) return false;

      // Only apply location filtering if searchAnywhere is false and coordinates are provided
      if (!searchAnywhere && userLatitude !== null && userLongitude !== null) {
        // If farmer has location, check distance
        if (
          farmer.location &&
          farmer.location.latitude !== undefined &&
          farmer.location.longitude !== undefined
        ) {
          const farmerLatitude = parseFloat(farmer.location.latitude);
          const farmerLongitude = parseFloat(farmer.location.longitude);

          const distance = calculateDistance(
            userLatitude,
            userLongitude,
            farmerLatitude,
            farmerLongitude
          );
          
          if (distance > searchRadius) {
            console.log('Farmer outside radius:', farmer._id, 'distance:', distance);
            return false;
          }
        } else {
          console.log('Farmer missing location:', farmer._id, '- including in results');
        }
      }

      if (deliveryFilter !== null && farmer.deliveryAvailable !== deliveryFilter) {
        console.log('Farmer delivery mismatch:', farmer._id);
        return false;
      }

      if (wholesaleFilter !== null && farmer.wholesaleAvailable !== wholesaleFilter) {
        console.log('Farmer wholesale mismatch:', farmer._id);
        return false;
      }

      return true;
    });

    console.log('Final filtered products:', filteredProducts.length);
    res.json(filteredProducts);
  } catch (error) {
    console.error('Error in searchFarms:', error);
    res.status(500).json({ error: 'Server error during search.' });
  }
};