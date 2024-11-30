const User = require('../models/User');
const { sendSms } = require('../services/notificationService');

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

// Get nearby farmers based on buyer's location
exports.getNearbyFarmers = async (req, res) => {
  const { latitude, longitude } = req.body.location;
  const radius = 50; // Set a radius of 50 km

  try {
    // Find farmers
    const farmers = await User.find({ role: 'farmer' });
    const nearbyFarmers = farmers.filter((farmer) => {
      const distance = calculateDistance(latitude, longitude, farmer.location.latitude, farmer.location.longitude);
      return distance <= radius;
    });

    res.json(nearbyFarmers);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching nearby farmers', error });
  }
};

// Twilio notifications for contracts
const notifyFarmerOfNewBid = async (req, res) => {
    const { farmerPhoneNumber, bidDetails } = req.body;
    const message = `You have a new bid on your auction! Details: ${bidDetails}`;

    try {
        await sendSms(farmerPhoneNumber, message);
        res.status(200).json({ success: true, message: 'Notification sent' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to send notification', error });
    }
};

module.exports = { notifyFarmerOfNewBid };
