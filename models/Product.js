const mongoose = require('mongoose');

// Define product categories and their products
const productCategories = {
  Fruit: ['Apples', 'Oranges', 'Bananas', 'Berries', 'Grapes', 'Peaches'],
  Vegetable: ['Carrots', 'Tomatoes', 'Potatoes', 'Broccoli', 'Lettuce', 'Cucumbers', 'Peppers'],
  Meat: ['Beef', 'Pork', 'Chicken', 'Lamb', 'Goat'],
  Dairy: ['Milk', 'Cheese', 'Eggs', 'Yogurt', 'Butter'],
  Other: ['Honey', 'Grains', 'Corn', 'Beans', 'Nuts'],
};

// Certification and Food Safety Sub-schema
const CertificationSchema = new mongoose.Schema({
  organic: {
    isCertified: Boolean,
    certifyingBody: String,
    certificationNumber: String,
    validFrom: Date,
    validUntil: Date
  },
  foodSafety: [{
    certificationType: {
      type: String,
      enum: ['GAP', 'HACCP', 'FSMA', 'SQF', 'BRC', 'Other']
    },
    otherCertification: String,
    auditScore: Number,
    auditDate: Date,
    certifyingBody: String
  }],
  otherCertifications: [{
    name: String,
    certificationBody: String,
    validUntil: Date
  }]
});

// Product Specifications Sub-schema
const ProductSpecsSchema = new mongoose.Schema({
  varieties: [String],
  gradeStandard: String,
  size: {
    min: Number,
    max: Number,
    unit: {
      type: String,
      enum: ['cm', 'mm', 'g', 'kg', 'oz', 'lb']
    },
    packSize: {
      quantity: Number,
      unit: String
    }
  },
  seasonalAvailability: [{
    month: {
      type: String,
      enum: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    },
    available: Boolean
  }],
  shelfLife: {
    duration: Number,
    unit: {
      type: String,
      enum: ['days', 'weeks', 'months']
    }
  },
  storageRequirements: {
    temperature: {
      min: Number,
      max: Number,
      unit: {
        type: String,
        enum: ['°C', '°F'],
        default: '°C'
      }
    },
    humidity: {
      min: Number,
      max: Number,
      unit: {
        type: String,
        default: '%'
      }
    }
  }
});

// Production Practices Sub-schema
const ProductionPracticesSchema = new mongoose.Schema({
  growingMethod: {
    type: String,
    enum: ['Conventional', 'Organic', 'Hydroponic', 
           'Aquaponic', 'Regenerative', 'Biodynamic']
  },
  pestManagement: String,
  postHarvestHandling: String,
  waterTesting: [{
    testDate: Date,
    parameter: String,
    result: String,
    standard: String
  }],
  fieldLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],  // [longitude, latitude]
      required: false,
    }
  },
  growingConditions: String
});

const allowedProducts = Object.values(productCategories).flat();
const allowedCategories = Object.keys(productCategories);

const ProductSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: allowedCategories,  
    required: true,
  }, 
  totalQuantity: {
    type: Number, 
    required: false, 
    min: 0 
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
  description: { 
    type: String, 
    required: true 
  },
  imageUrl: { 
    type: String 
  },
  certifications: CertificationSchema,
  productSpecs: ProductSpecsSchema,
  productionPractices: ProductionPracticesSchema,
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  status: {
    type: String,
    enum: ['Approved', 'Pending Approval', 'Rejected'],
    default: 'Approved',
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
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