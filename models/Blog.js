import axios from 'axios';

const API_URL = 'http://localhost:5000/api'; // Adjust this for your API

// Retrieve the token from local storage
const getToken = () => localStorage.getItem('token');

// Fetch all blog posts
export const getBlogPosts = () => axios.get(`${API_URL}/blogs`);

// Fetch a single blog post by ID (with comments)
export const getBlogPost = (id) => axios.get(`${API_URL}/blogs/${id}`);

// Create a new blog post
export const createBlogPost = (data) =>
  axios.post(`${API_URL}/blogs/create`, data, {
    headers: {
      Authorization: `Bearer ${getToken()}`, // Attach token for authenticated requests
    },
  });

// Add a comment to a blog post
export const addCommentToBlogPost = (blogId, commentData) =>
  axios.post(`${API_URL}/blogs/${blogId}/comments`, commentData, {
    headers: {
      Authorization: `Bearer ${getToken()}`, // Attach token for authenticated requests
    },
  });

export default {
  getBlogPosts,
  getBlogPost,
  createBlogPost,
  addCommentToBlogPost,
};
