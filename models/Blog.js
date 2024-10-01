const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Comment Schema for threading
const commentSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  content: String,
  createdAt: { type: Date, default: Date.now },
  replies: [{ type: Schema.Types.ObjectId, ref: 'Comment' }]
});

const blogSchema = new Schema({
  title: String,
  content: String,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  comments: [commentSchema], // Embedded comments
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Blog', blogSchema);
