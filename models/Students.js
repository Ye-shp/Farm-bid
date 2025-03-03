const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const studentSchema = new mongoose.Schema({
  studentId: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  school: {
    type: String,
    required: true
  },
  enrolledDate: {
    type: Date,
    default: Date.now
  },
  farmsWorked: {
    type: Number,
    default: 0
  },
  successfulOnboards: {
    type: Number,
    default: 0
  },
  onboardedFarms: [{
    farmId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    onboardDate: {
      type: Date,
      default: Date.now
    }
  }]
});

studentSchema.pre('save', async function(next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

module.exports = mongoose.model('Student', studentSchema);