const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const Prospect = require('../models/Prospect');
require('dotenv').config();

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://yeabsiramesfin21:Ab366544@cluster0.cu0iwq2.mongodb.net/Farm-bid?retryWrites=true';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const results = [];

// Process both CSV files
const processCsvFiles = async () => {
  try {
    // Read buyers list
    await new Promise((resolve, reject) => {
      fs.createReadStream(path.join(__dirname, 'BuyerList.csv'))
        .pipe(csv())
        .on('data', (data) => {
          // Only add entries that have a category
          if (data.Category) {
            results.push({
              ...data,
              type: 'buyer'
            });
          } else {
            console.log(`Skipping buyer "${data['Buyer Name']}" due to missing category`);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Read farmers list
    await new Promise((resolve, reject) => {
      fs.createReadStream(path.join(__dirname, 'farmerslist.csv'))
        .pipe(csv())
        .on('data', (data) => {
          // Only add entries that have a category
          if (data.Category) {
            results.push({
              ...data,
              type: 'farmer'
            });
          } else {
            console.log(`Skipping farmer "${data['Farm/Buyer Name']}" due to missing category`);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Transform and save the data
    const prospects = results.map(row => ({
      name: row['Farm/Buyer Name'] || row['Buyer Name'],
      state: row.State,
      category: row.Category || 'Uncategorized', // Provide default category if empty
      website: row.Website || '',
      phone: row.Phone || '',
      email: row.Email || '',
      address: row.Address || '',
      notes: row.Notes || '',
      status: 'unclaimed',
      type: row.type
    }));

    // Clear existing prospects
    await Prospect.deleteMany({});

    // Insert new prospects
    await Prospect.insertMany(prospects);

    console.log(`Successfully imported ${prospects.length} prospects`);
    console.log('Breakdown by type:', {
      farmers: prospects.filter(p => p.type === 'farmer').length,
      buyers: prospects.filter(p => p.type === 'buyer').length
    });
    console.log('Breakdown by category:', 
      prospects.reduce((acc, p) => {
        acc[p.category] = (acc[p.category] || 0) + 1;
        return acc;
      }, {})
    );

    mongoose.connection.close();
  } catch (error) {
    console.error('Error importing prospects:', error);
    if (error.errors) {
      Object.keys(error.errors).forEach(key => {
        console.error(`Field "${key}":`, error.errors[key].message);
      });
    }
    mongoose.connection.close();
    process.exit(1);
  }
};

processCsvFiles(); 