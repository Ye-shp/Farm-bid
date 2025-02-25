const mongoose = require('mongoose');
const { Product, INVENTORY_REASONS } = require('../models/Product');
require('dotenv').config();

// Fix: Use a proper 24-character hex string for the ObjectId
const FARMER_ID = new mongoose.Types.ObjectId("67a46ab9ef9a29620222873d");

// Sample products data
const productsData = [
  {
    category: 'Fruit',
    title: 'Apples',
    totalQuantity: 500,
    description: 'Fresh organic apples from our orchard',
    user: FARMER_ID,
    status: 'Approved',
    lowStockThreshold: 100,
    imageUrl: 'https://example.com/apples.jpg'
  },
  {
    category: 'Vegetable',
    title: 'Tomatoes',
    totalQuantity: 300,
    description: 'Vine-ripened tomatoes',
    user: FARMER_ID,
    status: 'Approved',
    lowStockThreshold: 50,
    imageUrl: 'https://example.com/tomatoes.jpg'
  },
  {
    category: 'Dairy',
    title: 'Milk',
    totalQuantity: 1000,
    description: 'Fresh whole milk',
    user: FARMER_ID,
    status: 'Approved',
    lowStockThreshold: 200,
    imageUrl: 'https://example.com/milk.jpg'
  }
];

// Generate random inventory history entries
function generateInventoryHistory(productId, months = 3) {
  const history = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - (months * 30 * 24 * 60 * 60 * 1000));

  // Generate entries for each week
  for (let time = startDate; time <= now; time.setDate(time.getDate() + Math.random() * 7)) {
    const isAddition = Math.random() > 0.4;
    const reasons = isAddition ? INVENTORY_REASONS.ADD : INVENTORY_REASONS.REMOVE;
    const quantity = isAddition ? 
      Math.floor(Math.random() * 100) + 50 : 
      -(Math.floor(Math.random() * 50) + 10);

    history.push({
      quantity,
      reason: reasons[Math.floor(Math.random() * reasons.length)],
      location: ['Warehouse A', 'Warehouse B', 'Cold Storage', 'Main Facility'][Math.floor(Math.random() * 4)],
      notes: `${isAddition ? 'Added' : 'Removed'} inventory - Regular ${isAddition ? 'stocking' : 'operation'}`,
      timestamp: new Date(time)
    });
  }

  return history;
}

async function seedData() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing products for this farmer
    await Product.deleteMany({ user: FARMER_ID });
    console.log('Cleared existing products');

    // Create products with inventory history
    for (const productData of productsData) {
      const product = new Product(productData);
      
      // Generate some initial inventory history
      const history = generateInventoryHistory(product._id);
      
      // Ensure the final total quantity matches the product's totalQuantity
      let currentTotal = 0;
      history.forEach(entry => {
        currentTotal += entry.quantity;
      });
      
      // Add a balancing entry if needed
      if (currentTotal !== product.totalQuantity) {
        const adjustment = product.totalQuantity - currentTotal;
        history.push({
          quantity: adjustment,
          reason: adjustment > 0 ? 'adjustment' : 'adjustment',
          location: 'Main Facility',
          notes: 'Initial inventory adjustment',
          timestamp: new Date()
        });
      }
      
      product.inventoryHistory = history;
      await product.save();
      console.log(`Created product: ${product.title} with ${history.length} history entries`);
    }

    console.log('Seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
}

seedData();
