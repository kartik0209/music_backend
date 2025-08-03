const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

const router = express.Router();

// @desc    Rate a song
// @route   POST /api/ratings/:songId
// @access  Private
router.post('/:songId', [
  auth,
  [
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
  ]
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { songId } = req.params;
    const { rating } = req.body;
    const userId = req.user.userId;

    // Check if song exists
    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    // Get user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user has already rated this song
    const existingRating = user.ratings.find(r => r.song.toString() === songId);

    if (existingRating) {
      // Update existing rating
      const oldRating = existingRating.rating;
      await song.updateRating(oldRating, rating);
      user.rateSong(songId, rating);
    } else {
      // Add new rating
      await song.addRating(rating);
      user.rateSong(songId, rating);
    }

    await user.save();

    res.json({
      success: true,
      message: existingRating ? 'Rating updated successfully' : 'Rating added successfully',
      data: {
        rating,
        songRatings: {
          average: song.ratings.average,
          count: song.ratings.count
        }
      }
    });
  } catch (error) {
    console.error('Rate song error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rate song',
      error: error.message
    });
  }
});

// @desc    Get user's rating for a song
// @route   GET /api/ratings/:songId/user
// @access  Private
router.get('/:songId/user', auth, async (req, res) => {
  try {
    const { songId } = req.params;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const userRating = user.ratings.find(r => r.song.toString() === songId);

    res.json({
      success: true,
      data: {
        rating: userRating ? userRating.rating : null,
        ratedAt: userRating ? userRating.ratedAt : null
      }
    });
  } catch (error) {
    console.error('Get user rating error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user rating',
      error: error.message
    });
  }
});

// @desc    Get song ratings breakdown
// @route   GET /api/ratings/:songId
// @access  Public
router.get('/:songId', async (req, res) => {
  try {
    const { songId } = req.params;

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    res.json({
      success: true,
      data: {
        average: song.ratings.average,
        count: song.ratings.count,
        distribution: song.ratings.distribution
      }
    });
  } catch (error) {
    console.error('Get song ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get song ratings',
      error: error.message
    });
  }
});

// @desc    Remove rating
// @route   DELETE /api/ratings/:songId
// @access  Private
router.delete('/:songId', auth, async (req, res) => {
  try {
    const { songId } = req.params;
    const userId = req.user.userId;

    const song = await Song.findById(songId);
    if (!song) {
      return res.status(404).json({
        success: false,
        message: 'Song not found'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const ratingIndex = user.ratings.findIndex(r => r.song.toString() === songId);
    if (ratingIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Rating not found'
      });
    }

    const oldRating = user.ratings[ratingIndex].rating;

    // Update song rating distribution
    song.ratings.distribution[oldRating] -= 1;
    song.ratings.count -= 1;

    // Recalculate average
    if (song.ratings.count > 0) {
      let totalScore = 0;
      for (let i = 1; i <= 5; i++) {
        totalScore += i * song.ratings.distribution[i];
      }
      song.ratings.average = totalScore / song.ratings.count;
    } else {
      song.ratings.average = 0;
    }

    // Remove from user ratings
    user.ratings.splice(ratingIndex, 1);
    user.activity.ratingsGiven -= 1;

    await Promise.all([song.save(), user.save()]);

    res.json({
      success: true,
      message: 'Rating removed successfully'
    });
  } catch (error) {
    console.error('Remove rating error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove rating',
      error: error.message
    });
  }
});

// @desc    Get top rated songs
// @route   GET /api/ratings/top-rated
// @access  Public
router.get('/top-rated', async (req, res) => {
  try {
    const { limit = 20, minRatings = 5 } = req.query;

    const songs = await Song.find({
      status: 'active',
      'ratings.count': { $gte: parseInt(minRatings) }
    })
      .sort({ 'ratings.average': -1, 'ratings.count': -1 })
      .limit(parseInt(limit))
      .populate('uploadedBy', 'username profile.avatar');

    res.json({
      success: true,
      data: { songs }
    });
  } catch (error) {
    console.error('Get top rated songs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top rated songs',
      error: error.message
    });
  }
});

// @desc    Get recent ratings
// @route   GET /api/ratings/recent
// @access  Public
router.get('/recent', async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const users = await User.find({
      'ratings.0': { $exists: true }
    })
      .populate({
        path: 'ratings.song',
        populate: {
          path: 'uploadedBy',
          select: 'username profile.avatar'
        }
      })
      .select('username profile.avatar ratings');

    // Flatten and sort all ratings
    const allRatings = [];
    users.forEach(user => {
      user.ratings.forEach(rating => {
        if (rating.song) {
          allRatings.push({
            user: {
              _id: user._id,
              username: user.username,
              avatar: user.profile.avatar
            },
            song: rating.song,
            rating: rating.rating,
            ratedAt: rating.ratedAt
          });
        }
      });
    });

    // Sort by date and limit
    allRatings.sort((a, b) => new Date(b.ratedAt) - new Date(a.ratedAt));
    const recentRatings = allRatings.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: { ratings: recentRatings }
    });
  } catch (error) {
    console.error('Get recent ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent ratings',
      error: error.message
    });
  }
});

module.exports = router;