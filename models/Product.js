const mongoose = require('mongoose');

// Define product categories and their products
const productCategories = {
  Fruit: ['Apples', 'Oranges', 'Bananas', 'Berries', 'Grapes', 'Peaches'],
  Vegetable: ['Carrots', 'Tomatoes', 'Potatoes', 'Broccoli', 'Lettuce', 'Cucumbers', 'Peppers'],
  Meat: ['Beef', 'Pork', 'Chicken', 'Lamb', 'Goat'],
  Dairy: ['Milk', 'Cheese', 'Eggs', 'Yogurt', 'Butter'],
  Other: ['Honey', 'Grains', 'Corn', 'Beans', 'Nuts'],
};


const allowedProducts = Object.values(productCategories).flat();

const allowedCategories = Object.keys(productCategories);

const ProductSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: allowedCategories,  
    required: true,
  },
  title: {
    type: String,
    enum: allowedProducts,
    required: function () {
      return !this.customProduct;
    },
  },
  customProduct: {
    type: String,
    required: function () {
      return !this.title;
    },
    trim: true,
  },
  description: { type: String, required: true },
  imageUrl: { type: String },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: {
    type: String,
    enum: ['Approved', 'Pending Approval', 'Rejected'],
    default: 'Approved',
  },
  createdAt: { type: Date, default: Date.now },
});


ProductSchema.pre('validate', function (next) {
  if (!this.title && !this.customProduct) {
    next(new Error('Either "title" or "customProduct" must be provided.'));
  } else if (this.title && this.customProduct) {
    next(new Error('Provide either "title" or "customProduct", not both.'));
  } else {
    next();
  }
});

ProductSchema.index({ title: 1 });
ProductSchema.index({ customProduct: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ status: 1 });

const Product = mongoose.model('Product', ProductSchema);

module.exports = {
  Product,
  productCategories,
  allowedCategories,
  allowedProducts
};
