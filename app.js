const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const morgan = require('morgan'); // Added for request logging
const cors = require('cors');
const multer = require('multer');
const AWS = require('aws-sdk');

// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev')); // HTTP request logging

// Multer setup for handling file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://<your-default-uri>'; // Fallback in case MONGO_URI is not set
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => {
        console.error('MongoDB connection error:', err); // Detailed logging of MongoDB errors
        process.exit(1); // Exit the app in case of connection failure
    });

// Routes
app.get('/', (req, res) => {
    res.send('Welcome to Farm Bid Backend');
});

app.post('/upload', upload.single('file'), (req, res) => {
    console.log('Upload route hit'); // Log when upload route is hit

    if (!req.file) {
        return res.status(400).send({ message: 'No file uploaded' });
    }

    // Upload to AWS S3 logic
    const s3 = new AWS.S3({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION
    });

    const params = {
        Bucket: process.env.S3_BUCKET_NAME,
        Key: req.file.originalname,
        Body: req.file.buffer,
        ContentType: req.file.mimetype
    };

    s3.upload(params, (err, data) => {
        if (err) {
            console.error('S3 upload error:', err); // Log S3 upload error
            return res.status(500).send({ message: 'Error uploading file' });
        }

        res.send({ message: 'File uploaded successfully', data });
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack); // Detailed error stack logging
    res.status(500).json({ message: 'An internal server error occurred' });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
