// farm-bid-backend/jobs/cronJobs.js
const cron = require('node-cron');
const Blog = require('../models/Blog');
const FeaturedFarms = require('../models/FeaturedFarms');
const recurringPaymentService = require('../services/recurringPaymentService');

// Schedule a cron job to run every Monday at midnight
cron.schedule('0 0 * * MON', async () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running weekly featured farms update...`);
  
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

    // Log the result of aggregation to see if it has data
    console.log(`[${timestamp}] Aggregation result (topEngagedUsers):`, topEngagedUsers);

    // Update the FeaturedFarms document
    let featuredFarms = await FeaturedFarms.findOne();
    if (!featuredFarms) {
      await FeaturedFarms.create({ farms: topEngagedUsers });
    } else {
      featuredFarms.farms = topEngagedUsers;
      await featuredFarms.save();
    }

    console.log(`[${timestamp}] Weekly featured farms updated successfully:`, topEngagedUsers);
  } catch (error) {
    console.error(`[${timestamp}] Error updating weekly featured farms:`, error);
  }
});

// Process recurring payments daily at 3 AM
cron.schedule('0 3 * * *', async () => {
  console.log('Running recurring payment processing job');
  await recurringPaymentService.processRecurringPayments();
});

// Send payment reminders daily at 9 AM
cron.schedule('0 9 * * *', async () => {
  console.log('Running payment reminder job');
  await recurringPaymentService.sendPaymentReminders();
});

// Check for expiring payment methods on the 1st of each month
cron.schedule('0 10 1 * *', async () => {
  console.log('Running payment method expiration check job');
  await recurringPaymentService.handleExpiringPaymentMethods();
});

// Retry failed payments every 12 hours
cron.schedule('0 */12 * * *', async () => {
  console.log('Running failed payment retry job');
  await recurringPaymentService.handleFailedPayments();
});

// Check for contract renewals daily at 11 AM
cron.schedule('0 11 * * *', async () => {
  console.log('Running contract renewal check job');
  await recurringPaymentService.checkContractRenewals();
});

// Import all cron jobs
require('./auctionEndJob');
require('./recurringContractJob'); // Add the new recurring contract job

console.log('All cron jobs scheduled successfully');

module.exports = cron;
