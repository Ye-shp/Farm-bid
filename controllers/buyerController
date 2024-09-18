const User = require('../models/User');

// Function to calculate distance between two coordinates
function calculateDistance(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const R = 6371; // Radius of Earth in kilometers
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
}

// Get nearby buyers based on farmer's location
exports.getNearbyBuyers = async (req, res) => {
  const { latitude, longitude } = req.body.location;
  const radius = 50; // Set a radius of 50 km

  try {
    // Find buyers
    const buyers = await User.find({ role: 'buyer' });
    const nearbyBuyers = buyers.filter((buyer) => {
      const distance = calculateDistance(latitude, longitude, buyer.location.latitude, buyer.location.longitude);
      return distance <= radius;
    });

    res.json(nearbyBuyers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching nearby buyers', error });
  }
};
