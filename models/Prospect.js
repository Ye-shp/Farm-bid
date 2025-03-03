const mongoose = require('mongoose');

const ProspectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  state: { type: String, required: true },
  category: { type: String, required: true },
  website: String,
  phone: String,
  email: String,
  address: String,
  notes: String,
  status: {
    type: String,
    enum: ['unclaimed', 'in_progress', 'converted', 'declined'],
    default: 'unclaimed'
  },
  assignedStudent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student'
  },
  assignedDate: Date,
  lastContactDate: Date,
  contactHistory: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student'
    },
    date: Date,
    notes: String,
    contactMethod: {
      type: String,
      enum: ['email', 'phone', 'in_person', 'other']
    }
  }],
  convertedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Prospect', ProspectSchema); 