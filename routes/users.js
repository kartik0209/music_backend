const express = require('express');
const User = require('../models/User');
const Song = require('../models/Song');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// @desc    Get all users (Admin only)
// @route   GET /api/users
// @access  Private (Admin)
router.get('/', [auth, adminAuth], async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query; 

    const query = {};
    
    if (search) {
      query.$or = [
        { username: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { 'profile.firstName': new RegExp(search, 'i') },
        { 'profile.lastName': new RegExp(search, 'i') }
      ];
    }

    if (status) {
      query.accountStatus = status;
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users,
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
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
});

// @desc    Get user profile by ID
// @route   GET /api/users/:id
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('social.following.user', 'username profile.firstName profile.lastName profile.avatar')
      .populate('social.followers.user', 'username profile.firstName profile.lastName profile.avatar');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check privacy settings
    if (!user.preferences.privacy.profilePublic && 
        (!req.user || req.user.userId !== user._id.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Profile is private'
      });
    }

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Get user profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: error.message
    });
  }
});

// @desc    Follow/Unfollow user
// @route   POST /api/users/:id/follow
// @access  Private
router.post('/:id/follow', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.userId;

    if (targetUserId === currentUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow yourself'
      });
    }

    const [currentUser, targetUser] = await Promise.all([
      User.findById(currentUserId),
      User.findById(targetUserId)
    ]);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Toggle follow for current user
    const followResult = currentUser.toggleFollowUser(targetUserId);
    
    // Update target user's followers
    const followerIndex = targetUser.social.followers.findIndex(
      f => f.user.toString() === currentUserId
    );

    if (followResult.action === 'followed') {
      if (followerIndex === -1) {
        targetUser.social.followers.push({
          user: currentUserId,
          followedAt: new Date()
        });
      }
    } else {
      if (followerIndex > -1) {
        targetUser.social.followers.splice(followerIndex, 1);
      }
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    res.json({
      success: true,
      message: `User ${followResult.action} successfully`,
      data: { action: followResult.action }
    });
  } catch (error) {
    console.error('Follow user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to follow/unfollow user',
      error: error.message
    });
  }
});

// @desc    Follow/Unfollow artist
// @route   POST /api/users/follow-artist
// @access  Private
router.post('/follow-artist', auth, async (req, res) => {
  try {
    const { artistName } = req.body;

    if (!artistName) {
      return res.status(400).json({
        success: false,
        message: 'Artist name is required'
      });
    }

    const user = await User.findById(req.user.userId);
    const result = user.toggleFollowArtist(artistName);
    
    await user.save();

    res.json({
      success: true,
      message: `Artist ${result.action} successfully`,
      data: { action: result.action, artist: artistName }
    });
  } catch (error) {
    console.error('Follow artist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to follow/unfollow artist',
      error: error.message
    });
  }
});

// @desc    Get user's listening history
// @route   GET /api/users/:id/history
// @access  Private (Own history or admin)
router.get('/:id/history', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.userId;

    // Check permissions
    if (targetUserId !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { page = 1, limit = 50 } = req.query;

    const user = await User.findById(targetUserId)
      .populate({
        path: 'listeningHistory.song',
        populate: {
          path: 'uploadedBy',
          select: 'username profile.avatar'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Paginate listening history
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const history = user.listeningHistory.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        history,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(user.listeningHistory.length / limit),
          total: user.listeningHistory.length,
          hasNext: endIndex < user.listeningHistory.length,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get listening history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch listening history',
      error: error.message
    });
  }
});

// @desc    Get user's ratings
// @route   GET /api/users/:id/ratings
// @access  Private (Own ratings or admin)
router.get('/:id/ratings', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.userId;

    // Check permissions
    if (targetUserId !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { page = 1, limit = 50, rating } = req.query;

    const user = await User.findById(targetUserId)
      .populate({
        path: 'ratings.song',
        populate: {
          path: 'uploadedBy',
          select: 'username profile.avatar'
        }
      });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    let ratings = user.ratings;

    // Filter by rating if specified
    if (rating) {
      ratings = ratings.filter(r => r.rating === parseInt(rating));
    }

    // Sort by date (most recent first)
    ratings.sort((a, b) => new Date(b.ratedAt) - new Date(a.ratedAt));

    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedRatings = ratings.slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        ratings: paginatedRatings,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(ratings.length / limit),
          total: ratings.length,
          hasNext: endIndex < ratings.length,
          hasPrev: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Get user ratings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user ratings',
      error: error.message
    });
  }
});

// @desc    Get user statistics
// @route   GET /api/users/:id/stats
// @access  Private (Own stats or admin)
router.get('/:id/stats', auth, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const currentUserId = req.user.userId;

    // Check permissions
    if (targetUserId !== currentUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const user = await User.findById(targetUserId)
      .populate('listeningHistory.song')
      .populate('ratings.song');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Calculate statistics
    const stats = {
      basic: {
        totalPlayTime: user.activity.totalPlayTime,
        songsPlayed: user.activity.songsPlayed,
        ratingsGiven: user.activity.ratingsGiven,
        followersCount: user.followerCount,
        followingCount: user.followingCount
      },
      genres: {},
      artists: {},
      averageRating: 0,
      recentActivity: {
        lastWeek: 0,
        lastMonth: 0
      }
    };

    // Calculate genre and artist statistics
    user.listeningHistory.forEach(entry => {
      if (entry.song && entry.song.genre) {
        entry.song.genre.forEach(genre => {
          stats.genres[genre] = (stats.genres[genre] || 0) + 1;
        });
      }
      
      if (entry.song && entry.song.artist) {
        stats.artists[entry.song.artist] = (stats.artists[entry.song.artist] || 0) + 1;
      }
    });

    // Calculate average rating
    if (user.ratings.length > 0) {
      const totalRating = user.ratings.reduce((sum, rating) => sum + rating.rating, 0);
      stats.averageRating = totalRating / user.ratings.length;
    }

    // Calculate recent activity
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    stats.recentActivity.lastWeek = user.listeningHistory.filter(
      entry => entry.playedAt >= oneWeekAgo
    ).length;

    stats.recentActivity.lastMonth = user.listeningHistory.filter(
      entry => entry.playedAt >= oneMonthAgo
    ).length;

    res.json({
      success: true,
      data: { stats }
    });
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user statistics',
      error: error.message
    });
  }
});

// @desc    Update user status (Admin only)
// @route   PUT /api/users/:id/status
// @access  Private (Admin)
router.put('/:id/status', [auth, adminAuth], async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'suspended', 'deactivated'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: active, suspended, deactivated'
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { accountStatus: status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: { user }
    });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error.message
    });
  }
});

// @desc    Search users
// @route   GET /api/users/search
// @access  Public
router.get('/search', async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const searchQuery = {
      accountStatus: 'active',
      'preferences.privacy.profilePublic': true,
      $or: [
        { username: new RegExp(q, 'i') },
        { 'profile.firstName': new RegExp(q, 'i') },
        { 'profile.lastName': new RegExp(q, 'i') }
      ]
    };

    const users = await User.find(searchQuery)
      .select('username profile.firstName profile.lastName profile.avatar profile.bio')
      .sort({ followerCount: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(searchQuery);

    res.json({
      success: true,
      data: {
        users,
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
    console.error('Search users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search users',
      error: error.message
    });
  }
});

module.exports = router;