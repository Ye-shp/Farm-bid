const cron = require('node-cron');
const auctionController = require('../controllers/auctionControllers');

// Schedule a cron job to run every hour to check for expired auctions
cron.schedule('0 * * * *', async () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running auction end check...`);
  
  try {
    // Use the existing function from the auction controller
    await auctionController.checkAndUpdateExpiredAuctions();
    console.log(`[${timestamp}] Auction end check completed successfully`);
  } catch (error) {
    console.error(`[${timestamp}] Error in auction end job:`, error);
  }
});

console.log('Auction end job scheduled successfully'); 