const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const Playlist = require('../models/Playlist');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// @desc    Get admin dashboard analytics
// @route   GET /api/analytics/dashboard
// @access  Private (Admin)
router.get('/dashboard', [auth, adminAuth], async (req, res) => {
  try {
    const [
      totalUsers,
      totalSongs,
      totalPlaylists,
      activeUsers,
      totalPlays,
      totalRatings
    ] = await Promise.all([
      User.countDocuments(),
      Song.countDocuments({ status: 'active' }),
      Playlist.countDocuments({ status: 'active' }),
      User.countDocuments({ accountStatus: 'active' }),
      Song.aggregate([
        { $match: { status: 'active' } },
        { $group: { _id: null, total: { $sum: '$playCount' } } }
      ]),
      User.aggregate([
        { $unwind: '$ratings' },
        { $count: 'total' }
      ])
    ]);

    // Get user growth over last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get top genres
    const topGenres = await Song.aggregate([
      { $match: { status: 'active' } },
      { $unwind: '$genre' },
      {
        $group: {
          _id: '$genre',
          count: { $sum: 1 },
          totalPlays: { $sum: '$playCount' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get most active users
    const mostActiveUsers = await User.find({
      accountStatus: 'active'
    })
      .sort({ 'activity.songsPlayed': -1 })
      .limit(10)
      .select('username profile.avatar activity.songsPlayed activity.totalPlayTime');

    // Get trending songs
    const trendingSongs = await Song.find({ status: 'active' })
      .sort({ 'trending.score': -1 })
      .limit(10)
      .populate('uploadedBy', 'username profile.avatar')
      .select('title artist playCount ratings trending');

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalSongs,
          totalPlaylists,
          activeUsers,
          totalPlays: totalPlays[0]?.total || 0,
          totalRatings: totalRatings[0]?.total || 0
        },
        userGrowth,
        topGenres,
        mostActiveUsers,
        trendingSongs
      }
    });
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics data',
      error: error.message
    });
  }
});

// @desc    Get user analytics
// @route   GET /api/analytics/users
// @access  Private (Admin)
router.get('/users', [auth, adminAuth], async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // User registration trends
    const registrationTrends = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // User activity distribution
    const activityDistribution = await User.aggregate([
      {
        $bucket: {
          groupBy: '$activity.songsPlayed',
          boundaries: [0, 10, 50, 100, 500, 1000],
          default: '1000+',
          output: {
            count: { $sum: 1 },
            users: { $push: '$username' }
          }
        }
      }
    ]);

    // Top listeners
    const topListeners = await User.find({
      accountStatus: 'active'
    })
      .sort({ 'activity.totalPlayTime': -1 })
      .limit(20)
      .select('username profile activity');

    // Geographic distribution (if country data exists)
    const geographicDistribution = await User.aggregate([
      {
        $match: {
          'profile.country': { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$profile.country',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 20 }
    ]);

    res.json({
      success: true,
      data: {
        registrationTrends,
        activityDistribution,
        topListeners,
        geographicDistribution
      }
    });
  } catch (error) {
    console.error('User analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user analytics',
      error: error.message
    });
  }
});

// @desc    Get song analytics
// @route   GET /api/analytics/songs
// @access  Private (Admin)
router.get('/songs', [auth, adminAuth], async (req, res) => {
  try {
    const { period = '30' } = req.query;
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Most played songs
    const mostPlayedSongs = await Song.find({ status: 'active' })
      .sort({ playCount: -1 })
      .limit(20)
      .populate('uploadedBy', 'username profile.avatar')
      .select('title artist playCount ratings genre');

    // Songs by upload date
    const uploadTrends = await Song.aggregate([
      {
        $match: {
          uploadDate: { $gte: startDate },
          status: 'active'
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$uploadDate' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Genre popularity over time
    const genrePopularity = await Song.aggregate([
      { $match: { status: 'active' } },
      { $unwind: '$genre' },
      {
        $group: {
          _id: '$genre',
          totalSongs: { $sum: 1 },
          totalPlays: { $sum: '$playCount' },
          averageRating: { $avg: '$ratings.average' }
        }
      },
      { $sort: { totalPlays: -1 } }
    ]);

    // Language distribution
    const languageDistribution = await Song.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$language',
          count: { $sum: 1 },
          totalPlays: { $sum: '$playCount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Rating distribution
    const ratingDistribution = await Song.aggregate([
      { $match: { status: 'active', 'ratings.count': { $gt: 0 } } },
      {
        $bucket: {
          groupBy: '$ratings.average',
          boundaries: [0, 1, 2, 3, 4, 5],
          default: 'unrated',
          output: {
            count: { $sum: 1 },
            avgPlays: { $avg: '$playCount' }
          }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        mostPlayedSongs,
        uploadTrends,
        genrePopularity,
        languageDistribution,
        ratingDistribution
      }
    });
  } catch (error) {
    console.error('Song analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch song analytics',
      error: error.message
    });
  }
});

// @desc    Get playlist analytics
// @route   GET /api/analytics/playlists
// @access  Private (Admin)
router.get('/playlists', [auth, adminAuth], async (req, res) => {
  try {
    // Most popular playlists
    const popularPlaylists = await Playlist.find({
      status: 'active',
      privacy: 'public'
    })
      .sort({ playCount: -1, followerCount: -1 })
      .limit(20)
      .populate('owner', 'username profile.avatar')
      .select('name playCount followerCount songCount category');

    // Playlist creation trends
    const creationTrends = await Playlist.aggregate([
      {
        $match: {
          status: 'active',
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Category distribution
    const categoryDistribution = await Playlist.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgSongs: { $avg: { $size: '$songs' } },
          totalPlays: { $sum: '$playCount' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Privacy settings distribution
    const privacyDistribution = await Playlist.aggregate([
      { $match: { status: 'active' } },
      {
        $group: {
          _id: '$privacy',
          count: { $sum: 1 }
        }
      }
    ]);

    // Most followed playlists
    const mostFollowedPlaylists = await Playlist.find({
      status: 'active',
      privacy: 'public'
    })
      .sort({ followerCount: -1 })
      .limit(10)
      .populate('owner', 'username profile.avatar')
      .select('name followerCount songCount category');

    res.json({
      success: true,
      data: {
        popularPlaylists,
        creationTrends,
        categoryDistribution,
        privacyDistribution,
        mostFollowedPlaylists
      }
    });
  } catch (error) {
    console.error('Playlist analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch playlist analytics',
      error: error.message
    });
  }
});

// @desc    Get revenue analytics (if applicable)
// @route   GET /api/analytics/revenue
// @access  Private (Admin)
router.get('/revenue', [auth, adminAuth], async (req, res) => {
  try {
    // This would be implemented if you have premium features
    // For now, return placeholder data structure
    
    res.json({
      success: true,
      data: {
        message: 'Revenue analytics would be implemented here for premium features',
        totalRevenue: 0,
        subscriptions: {
          active: 0,
          cancelled: 0,
          pending: 0
        },
        revenueByPlan: [],
        monthlyRecurring: 0
      }
    });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch revenue analytics',
      error: error.message
    });
  }
});

// @desc    Get listening session analytics
// @route   GET /api/analytics/sessions
// @access  Private (Admin)
router.get('/sessions', [auth, adminAuth], async (req, res) => {
  try {
    const { period = '7' } = req.query;
    const days = parseInt(period);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Session duration analysis
    const sessionAnalysis = await User.aggregate([
      { $unwind: '$listeningHistory' },
      {
        $match: {
          'listeningHistory.playedAt': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            user: '$_id',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$listeningHistory.playedAt' } }
          },
          sessionDuration: { $sum: '$listeningHistory.duration' },
          songsPlayed: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.date',
          avgSessionDuration: { $avg: '$sessionDuration' },
          totalSessions: { $sum: 1 },
          avgSongsPerSession: { $avg: '$songsPlayed' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Peak listening hours
    const peakHours = await User.aggregate([
      { $unwind: '$listeningHistory' },
      {
        $match: {
          'listeningHistory.playedAt': { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $hour: '$listeningHistory.playedAt' },
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Device/platform analytics would go here if you track that data
    const deviceAnalytics = {
      message: 'Device analytics would be tracked here',
      platforms: []
    };

    res.json({
      success: true,
      data: {
        sessionAnalysis,
        peakHours,
        deviceAnalytics
      }
    });
  } catch (error) {
    console.error('Session analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session analytics',
      error: error.message
    });
  }
});

// @desc    Export analytics data
// @route   GET /api/analytics/export
// @access  Private (Admin)
router.get('/export', [auth, adminAuth], async (req, res) => {
  try {
    const { type = 'overview', format = 'json' } = req.query;

    let data = {};

    switch (type) {
      case 'users':
        data = await User.find().select('-password -emailVerificationToken -passwordResetToken');
        break;
      case 'songs':
        data = await Song.find({ status: 'active' }).populate('uploadedBy', 'username');
        break;
      case 'playlists':
        data = await Playlist.find({ status: 'active' }).populate('owner', 'username');
        break;
      default:
        data = {
          users: await User.countDocuments(),
          songs: await Song.countDocuments({ status: 'active' }),
          playlists: await Playlist.countDocuments({ status: 'active' }),
          exportedAt: new Date()
        };
    }

    if (format === 'csv') {
      // Convert to CSV format (you might want to use a proper CSV library)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export.csv"`);
      // CSV conversion logic would go here
      res.send('CSV export not implemented yet');
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${type}-export.json"`);
      res.json({
        success: true,
        exportType: type,
        exportedAt: new Date(),
        data
      });
    }
  } catch (error) {
    console.error('Export analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export analytics data',
      error: error.message
    });
  }
});

module.exports = router;