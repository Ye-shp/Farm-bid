// farm-bid-backend/jobs/cronJobs.js
const cron = require('node-cron');
const Blog = require('../models/Blog');
const FeaturedFarms = require('../models/FeaturedFarms');

// Schedule a cron job to run every Monday at midnight
cron.schedule('0 0 * * MON', async () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running weekly featured farms update...`);

  try {
    // Step 1: Aggregate top engaged users based on blog data
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

    console.log(`[${timestamp}] Aggregation result (topEngagedUsers):`, topEngagedUsers);

    // Step 2: Check if there are results to update
    if (topEngagedUsers.length === 0) {
      console.log(`[${timestamp}] No farms qualified for featuring this week.`);
      return;
    }

    // Step 3: Find or create the FeaturedFarms document
    let featuredFarms = await FeaturedFarms.findOne();
    
    if (!featuredFarms) {
      // If no document exists, create a new one
      featuredFarms = new FeaturedFarms({ farms: topEngagedUsers });
      await featuredFarms.save();
      console.log(`[${timestamp}] Created new FeaturedFarms document:`, featuredFarms);
    } else {
      // If document exists, update it
      featuredFarms.farms = topEngagedUsers;
      await featuredFarms.save();
      console.log(`[${timestamp}] Updated existing FeaturedFarms document:`, featuredFarms);
    }
    
    console.log(`[${timestamp}] Weekly featured farms update completed successfully.`);
  } catch (error) {
    console.error(`[${timestamp}] Error updating featured farms:`, error);
  }
});

module.exports = cron;
