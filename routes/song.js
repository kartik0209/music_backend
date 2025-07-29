const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const upload = require('../middleware/upload');

const router = express.Router();

// @desc    Get all songs with filters and pagination
// @route   GET /api/songs
// @access  Public
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      genre,
      language,
      mood,
      artist,
      minRating,
      sortBy = 'playCount',
      sortOrder = 'desc'
    } = req.query;

    const filters = {};
    
    // Build filters
    if (genre) filters.genre = genre.split(',');
    if (language) filters.language = language;
    if (mood) filters.mood = mood.split(',');
    if (artist) filters.artist = artist;
    if (minRating) filters.minRating = parseFloat(minRating);

    // Search songs
    const songs = await Song.searchSongs(search, filters);

    // Apply sorting
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const paginatedSongs = await Song.aggregate([
      { $match: { _id: { $in: songs.map(s => s._id) } } },
      { $sort: sortOptions },
      { $skip: (page - 1) * parseInt(limit) },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: 'users',
          localField: 'uploadedBy',
          foreignField: '_id',
          as: 'uploadedBy',
          pipeline: [
            { $project: { username: 1, 'profile.avatar': 1 } }
          ]
        }
      },
      { $unwind: '$uploadedBy' }
    ]);

    // Get total count for pagination
    const total = songs.length;

    res.json({
      success: true,
      data: {
        songs: paginatedSongs,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          hasNext: page * limit < total,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch songs',
      error: error.message
    });
  }
});

// @desc    Get trending songs
// @route   GET /api/songs/trending
// @access  Public
router.get('/trending', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const songs = await Song.getTrending(parseInt(limit));

    res.json({
      success: true,
      data: { songs }
    });
  } catch (error) {
    console.error('Get trending songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch trending songs',
      error: error.message
    });
  }
});

// @desc    Get featured songs
// @route   GET /api/songs/featured
// @access  Public
router.get('/featured', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    const songs = await Song.getFeatured(parseInt(limit));

    res.json({
      success: true,
      data: { songs }
    });
  } catch (error) {
    console.error('Get featured songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch featured songs',
      error: error.message
    });
  }
});

