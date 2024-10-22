// farm-bid-backend/jobs/cronJobs.js
const cron = require('node-cron');
const Blog = require('../models/Blog');
const FeaturedFarms = require('../models/FeaturedFarms');

// Schedule a cron job to run every Monday at midnight
cron.schedule('0 0 * * MON', async () => {
  console.log('Running weekly featured farms update...');
  
  try {
    // Aggregate the most engaged farms
    const topEngagedUsers = await Blog.aggregate([
      {
        $group: {
          _id: "$user", // Group by user ID (farmer)
          totalEngagement: {
            $sum: {
              $add: ["$views", { $size: "$likes" }, { $size: "$comments" }]
            }
          }
        }
      },
      { $sort: { totalEngagement: -1 } }, // Sort by highest engagement
      { $limit: 3 }  // Limit to top 3 farms
    ]);

    // Update the FeaturedFarms document
    let featuredFarms = await FeaturedFarms.findOne();
    if (!featuredFarms) {
      await FeaturedFarms.create({ farms: topEngagedUsers });
    } else {
      featuredFarms.farms = topEngagedUsers;
      await featuredFarms.save();
    }

    console.log('Weekly featured farms updated successfully:', topEngagedUsers);
  } catch (error) {
    console.error('Error updating weekly featured farms:', error);
  }
});

module.exports = cron;
