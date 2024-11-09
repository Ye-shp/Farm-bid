const mongoose = require('mongoose');

const OpenContractSchema = new mongoose.Schema({
  buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  productType: { type: String, required: true }, // e.g., 'Honey', 'Apples', etc.
  quantity: { type: Number, required: true }, // Quantity required by the buyer
  maxPrice: { type: Number, required: true }, // Maximum price the buyer is willing to pay
  endTime: { type: Date, required: true }, // Time until the contract is open
  status: { type: String, required: true, enum: ['open', 'fulfilled', 'closed'], default: 'open' },
  fulfillments: [
    {
      farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true },
      fulfilledAt: { type: Date, default: Date.now }
    }
  ],
  winningFulfillment: {
    farmer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    quantity: { type: Number },
    price: { type: Number }
  }
});

module.exports = mongoose.model('OpenContract', OpenContractSchema);
