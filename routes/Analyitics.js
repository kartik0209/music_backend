const express = require('express');
const Song = require('../models/Song');
const User = require('../models/User');
const Playlist = require('../models/Playlist');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// @desc    Get comprehensive dashboard statistics
// @route   GET /api/analytics/stats
// @access  Private (Admin)
router.get('/stats', [auth, adminAuth], async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [
            userStats,
            songStats,
            playlistStats,
            genreDistribution,
            languageDistribution
        ] = await Promise.all([
            // Aggregate User Statistics
            User.aggregate([
                {
                    $facet: {
                        "totalUsers": [{ $count: "count" }],
                        "activeUsers": [{ $match: { accountStatus: 'active' } }, { $count: "count" }],
                        "newUsersThisMonth": [{ $match: { createdAt: { $gte: thirtyDaysAgo } } }, { $count: "count" }],
                        "totalFollows": [{ $group: { _id: null, total: { $sum: { $size: "$following" } } } }]
                    }
                }
            ]),
            // Aggregate Song Statistics
            Song.aggregate([
                {
                    $facet: {
                        "totalSongs": [{ $count: "count" }],
                        "activeSongs": [{ $match: { status: 'active' } }, { $count: "count" }],
                        "featuredSongs": [{ $match: { featured: true } }, { $count: "count" }],
                        "totalLikes": [{ $group: { _id: null, total: { $sum: "$likeCount" } } }],
                        "totalPlays": [{ $group: { _id: null, total: { $sum: "$playCount" } } }],
                        "averageRating": [{ $group: { _id: null, avg: { $avg: "$ratings.average" } } }]
                    }
                }
            ]),
            // Aggregate Playlist Statistics
            Playlist.aggregate([
                {
                    $facet: {
                        "totalPlaylists": [{ $count: "count" }],
                        "publicPlaylists": [{ $match: { privacy: 'public' } }, { $count: "count" }],
                        // ✅ CORRECTED: Use $size to count followers in the array
                        "totalFollowers": [{ $group: { _id: null, total: { $sum: { $size: "$followers" } } } }]
                    }
                }
            ]),
            // Aggregate Top Genres
            Song.aggregate([
                { $unwind: "$genre" },
                { $group: { _id: "$genre", totalSongs: { $sum: 1 }, totalPlays: { $sum: "$playCount" } } },
                { $sort: { totalPlays: -1 } },
                { $limit: 5 }
            ]),
            // Aggregate Top Languages
            Song.aggregate([
                { $group: { _id: "$language", totalSongs: { $sum: 1 }, totalPlays: { $sum: "$playCount" } } },
                { $sort: { totalPlays: -1 } },
                { $limit: 5 }
            ])
        ]);

        const getCount = (facetResult, key) => facetResult[0]?.[key][0]?.count || 0;
        const getSum = (facetResult, key) => facetResult[0]?.[key][0]?.total || 0;
        const getAvg = (facetResult, key) => facetResult[0]?.[key][0]?.avg || 0;

        res.json({
            success: true,
            data: {
                users: {
                    total: getCount(userStats, "totalUsers"),
                    active: getCount(userStats, "activeUsers"),
                    newThisMonth: getCount(userStats, "newUsersThisMonth"),
                    totalFollows: getSum(userStats, "totalFollows")
                },
                songs: {
                    total: getCount(songStats, "totalSongs"),
                    active: getCount(songStats, "activeSongs"),
                    featured: getCount(songStats, "featuredSongs"),
                    totalLikes: getSum(songStats, "totalLikes"),
                    totalPlays: getSum(songStats, "totalPlays"),
                    averageRating: parseFloat(getAvg(songStats, "averageRating").toFixed(2))
                },
                playlists: {
                    total: getCount(playlistStats, "totalPlaylists"),
                    public: getCount(playlistStats, "publicPlaylists"),
                    totalFollowers: getSum(playlistStats, "totalFollowers")
                },
                distributions: {
                    topGenres: genreDistribution,
                    topLanguages: languageDistribution
                }
            }
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard statistics' });
    }
});

module.exports = router;