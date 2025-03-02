const mongoose = require('mongoose');
const { faker } = require('@faker-js/faker');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Blog = require('../models/Blog');
require('dotenv').config();

// Blog content data
const blogTitles = [
  "Our Sustainable Farming Journey: Year One",
  "How We Increased Crop Yield by 40% Using Organic Methods",
  "Building Community Through Local Agriculture",
  "Seasonal Guide: What We're Planting This Spring",
  "Farm to Table: Partnering with Local Restaurants",
  "Innovation in Small-Scale Farming",
  "Weather Challenges and How We Overcome Them",
  "Meet Our Farm Family: Stories from the Field",
  "Organic Pest Control: Natural Solutions That Work",
  "The Economics of Running a Small Farm",
  "Why We Chose Regenerative Agriculture",
  "Our Most Popular Products This Season",
  "Sustainable Water Management Techniques",
  "Learning from Traditional Farming Methods",
  "Future of Farming: Our Tech Integration Story"
];

const blogContents = [
  `Last month marked our first full year of implementing sustainable farming practices. The journey hasn't been easy, but the results are impressive. We've seen:

  • 30% reduction in water usage
  • Improved soil health across all fields
  • Higher quality produce
  • Increased biodiversity on our farm
  
  Here's what we learned and how we're moving forward...`,

  `When we switched to organic farming methods, many said our yields would suffer. Instead, we've found ways to increase production while maintaining soil health. Our key strategies:

  1. Companion planting
  2. Natural pest management
  3. Soil rotation techniques
  4. Microorganism cultivation
  
  The numbers speak for themselves...`,

  `Connecting with our local community has been the highlight of this year. Through farmers markets and CSA programs, we've built relationships that go beyond simple transactions.

  We're now serving:
  • 200+ regular customers
  • 5 local restaurants
  • 3 school districts
  
  Here's how we built these partnerships...`
];

const comments = [
  "This is exactly what we've been experiencing on our farm too!",
  "Could you share more details about your irrigation system?",
  "Love seeing sustainable practices in action.",
  "Great post! Looking forward to visiting your farm.",
  "Would love to learn more about your companion planting strategy.",
  "The results are impressive. How long did it take to see the improvements?",
  "Your farm is an inspiration to our community!",
  "Thanks for sharing these insights. Very helpful for new farmers.",
  "Do you offer farm tours? Would love to see this in person.",
  "We're implementing similar methods. The soil improvement is remarkable.",
  "What challenges did you face during the transition?",
  "Your dedication to sustainability is admirable.",
  "This is the future of farming!",
  "Do you have any workshops planned?",
  "The before/after photos are incredible."
];

// Helper functions
const randomDate = (start, end) => {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
};

const generateValidPhone = () => {
  const areaCode = String(Math.floor(Math.random() * 900) + 100);
  const prefix = String(Math.floor(Math.random() * 900) + 100);
  const lineNum = String(Math.floor(Math.random() * 9000) + 1000);
  return `+1${areaCode}${prefix}${lineNum}`;
};

// Generate user data
async function generateUsers(numNewUsers) {
  const users = [];
  const hashedPassword = await bcrypt.hash('password123', 10);
  const endDate = new Date();
  const startDate = new Date(endDate - 90 * 24 * 60 * 60 * 1000); // 90 days ago

  for (let i = 0; i < numNewUsers; i++) {
    const isFarmer = i < Math.ceil(numNewUsers / 3);
    const user = {
      username: faker.internet.username(), // Updated from userName() to username()
      email: faker.internet.email(),
      password: hashedPassword,
      role: isFarmer ? 'farmer' : 'buyer',
      phone: generateValidPhone(), // Use the new phone generator
      createdAt: randomDate(startDate, endDate),
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.location.state(),
        zipCode: faker.location.zipCode(),
        coordinates: {
          lat: parseFloat(faker.location.latitude()),
          lng: parseFloat(faker.location.longitude())
        }
      }
    };

    if (isFarmer) {
      user.description = faker.company.catchPhrase();
      user.socialMedia = {
        instagram: `@${faker.internet.username()}`, // Updated from userName()
        facebook: `fb/${faker.internet.username()}`, // Updated from userName()
        tiktok: `@${faker.internet.username()}` // Updated from userName()
      };
      user.wholesaleAvailable = faker.datatype.boolean();
      user.deliveryAvailable = faker.datatype.boolean();
      user.products = Array(faker.number.int({ min: 3, max: 8 })).fill().map(() => ({
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        price: parseFloat(faker.commerce.price())
      }));
      user.partners = Array(faker.number.int({ min: 1, max: 4 })).fill().map(() => ({
        name: faker.company.name(),
        location: `${faker.location.city()}, ${faker.location.state()}`,
        description: faker.company.catchPhrase()
      }));
    }

    users.push(user);
  }

  return users;
}

// Update the generateBlogs function
async function generateBlogs(farmers, allUsers) {
  const blogs = [];
  const endDate = new Date();
  const startDate = new Date(endDate - 90 * 24 * 60 * 60 * 1000);

  for (const farmer of farmers) {
    const numberOfBlogs = faker.number.int({ min: 2, max: 5 });
    
    for (let i = 0; i < numberOfBlogs; i++) {
      const blogDate = randomDate(startDate, endDate);
      
      // Generate base blog
      const blog = {
        title: faker.helpers.arrayElement(blogTitles),
        content: faker.helpers.arrayElement(blogContents),
        user: farmer._id,
        views: faker.number.int({ min: 100, max: 3000 }),
        createdAt: blogDate,
        updatedAt: blogDate,
        likes: faker.helpers.arrayElements(
          allUsers.map(u => u._id),
          faker.number.int({ min: 5, max: 45 })
        ),
        comments: []
      };

      // Generate comments
      const numberOfComments = faker.number.int({ min: 3, max: 12 });
      const generatedComments = [];

      // First generate all top-level comments
      for (let j = 0; j < numberOfComments; j++) {
        const comment = {
          user: faker.helpers.arrayElement(allUsers)._id,
          content: faker.helpers.arrayElement(comments),
          createdAt: randomDate(blogDate, endDate),
          taggedUsers: [],
          parentComment: null
        };

        // Add tags to some comments (20% chance)
        if (Math.random() < 0.2) {
          comment.taggedUsers = faker.helpers.arrayElements(
            allUsers.map(u => u._id),
            faker.number.int({ min: 1, max: 3 })
          );
        }

        generatedComments.push(comment);
      }

      // Add replies to some comments (30% chance for each comment)
      generatedComments.forEach((comment, index) => {
        if (index > 0 && Math.random() < 0.3) {
          const reply = {
            user: faker.helpers.arrayElement(allUsers)._id,
            content: faker.helpers.arrayElement(comments),
            createdAt: randomDate(comment.createdAt, endDate),
            taggedUsers: [],
            parentComment: comment._id
          };
          generatedComments.push(reply);
        }
      });

      blog.comments = generatedComments;
      blogs.push(blog);
    }
  }

  return blogs;
}

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    // Clear existing blogs first
    await Blog.deleteMany({});
    console.log('Cleared existing blogs');

    // Get existing users count
    const existingUsersCount = await User.countDocuments();
    console.log(`Found ${existingUsersCount} existing users`);

    // Generate and save new users if needed
    let numNewUsers = Math.max(30 - existingUsersCount, 0);
    if (numNewUsers > 0) {
      console.log(`Generating ${numNewUsers} new users...`);
      const newUsers = await generateUsers(numNewUsers);
      await User.insertMany(newUsers);
      console.log(`Created ${numNewUsers} new users`);
    }

    // Get ALL users from database
    const allUsers = await User.find();
    const farmers = allUsers.filter(user => user.role === 'farmer');
    
    console.log(`Found ${farmers.length} farmers for blog creation`);

    // Generate blogs for ALL farmers, not just new ones
    if (farmers.length > 0) {
      console.log(`Generating blogs for ${farmers.length} farmers...`);
      const blogs = await generateBlogs(farmers, allUsers);
      
      // Save blogs
      const savedBlogs = await Blog.insertMany(blogs);
      console.log(`Created ${savedBlogs.length} blogs`);

      // Update farmers with their blog references
      for (const farmer of farmers) {
        const farmerBlogs = savedBlogs.filter(blog => 
          blog.user.toString() === farmer._id.toString()
        );
        
        await User.findByIdAndUpdate(
          farmer._id,
          { $set: { blogs: farmerBlogs.map(blog => blog._id) } }
        );
      }
      console.log('Updated farmers with their blog references');
    }

    // Reset following/followers for all users
    console.log('Resetting following relationships...');
    await User.updateMany({}, { $set: { following: [], followers: [] } });

    // Create following relationships for all users
    console.log('Creating following relationships...');
    const followPromises = allUsers.map(async (user) => {
      const numberOfFollowing = faker.number.int({ min: 0, max: 5 });
      const potentialFollowing = allUsers.filter(u => u._id.toString() !== user._id.toString());
      const selectedFollowing = faker.helpers.arrayElements(potentialFollowing, numberOfFollowing);
      
      // Update user's following
      await User.findByIdAndUpdate(user._id, {
        $set: { following: selectedFollowing.map(u => u._id) }
      });

      // Update followers for followed users
      await User.updateMany(
        { _id: { $in: selectedFollowing.map(followedUser => followedUser._id) } },
        { $push: { followers: user._id } }
      );
    });
    await Promise.all(followPromises);

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Execute seeding
seedDatabase().catch(console.error);
