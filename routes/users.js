const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

// @desc    Get user statistics (Admin only)
// @route   GET /api/users/stats
// @access  Private (Admin)
router.get('/stats', [auth, adminAuth], async (req, res) => {
    try {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

        const [total, active, admins, newThisMonth] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ accountStatus: 'active' }),
            User.countDocuments({ role: 'admin' }),
            User.countDocuments({ createdAt: { $gte: oneMonthAgo } })
        ]);

        res.json({
            success: true,
            data: { total, active, admins, newThisMonth }
        });
    } catch (error) {
        console.error('Get user stats error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @desc    Get all users with filtering and pagination (Admin only)
// @route   GET /api/users
// @access  Private (Admin)
router.get('/', [auth, adminAuth], async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const query = {};

        if (search) {
            query.$or = [
                { username: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { 'profile.firstName': { $regex: search, $options: 'i' } },
                { 'profile.lastName': { $regex: search, $options: 'i' } }
            ];
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .skip((page - 1) * limit);

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    total,
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / limit),
                }
            }
        });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @desc    Update current user's profile
// @route   PUT /api/users/profile
// @access  Private
router.put('/profile', [auth], async (req, res) => {
    try {
        const { firstName, lastName, bio, avatar } = req.body;
        const userId = req.user.userId;

        console.log("ndhbfhdbf");

        const profileUpdates = {};
        if (firstName) profileUpdates['profile.firstName'] = firstName;
        if (lastName) profileUpdates['profile.lastName'] = lastName;
        if (bio) profileUpdates['profile.bio'] = bio;
        if (avatar) profileUpdates['profile.avatar'] = avatar;
        
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: profileUpdates },
            { new: true, runValidators: true }
        ).select('-password');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: user.profile
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});


// @desc    Update user status (Admin only)
// @route   PUT /api/users/:id/status
// @access  Private (Admin)
router.put('/:id/status', [auth, adminAuth], async (req, res) => {
    try {
        const { status } = req.body;
        if (!['active', 'suspended'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { accountStatus: status }, { new: true });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, message: 'User status updated', data: user });
    } catch (error) {
        console.error('Update user status error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// @desc    Delete a user (Admin only)
// @route   DELETE /api/users/:id
// @access  Private (Admin)
router.delete('/:id', [auth, adminAuth], async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

module.exports = router;