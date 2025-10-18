const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Helper function để xử lý validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu đầu vào không hợp lệ',
            errors: errors.array()
        });
    }
    next();
};

// @route   GET /api/user/profile
// @desc    Lấy thông tin profile của user hiện tại
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                user: req.user.getPublicProfile()
            }
        });
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy thông tin profile'
        });
    }
});

// @route   PUT /api/user/profile
// @desc    Cập nhật thông tin profile
// @access  Private
router.put('/profile', [
    body('fullName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Họ và tên phải có từ 2-100 ký tự'),
    body('phone')
        .optional()
        .matches(/^[0-9]{10,11}$/)
        .withMessage('Số điện thoại phải có 10-11 chữ số'),
    body('address')
        .optional()
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Địa chỉ phải có từ 10-500 ký tự'),
    body('plasticType')
        .optional()
        .isIn(['pet', 'bag', 'box', 'all', ''])
        .withMessage('Loại nhựa không hợp lệ')
], handleValidationErrors, authenticateToken, async (req, res) => {
    try {
        const { fullName, phone, address, plasticType } = req.body;
        const userId = req.user._id;

        // Kiểm tra phone có bị trùng không (nếu có thay đổi)
        if (phone && phone !== req.user.phone) {
            const existingUser = await User.findOne({ 
                phone, 
                _id: { $ne: userId } 
            });
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Số điện thoại đã được sử dụng'
                });
            }
        }

        // Cập nhật thông tin
        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (phone) updateData.phone = phone;
        if (address) updateData.address = address;
        if (plasticType !== undefined) updateData.plasticType = plasticType;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Cập nhật profile thành công',
            data: {
                user: updatedUser.getPublicProfile()
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi cập nhật profile'
        });
    }
});

// @route   PUT /api/user/change-password
// @desc    Đổi mật khẩu
// @access  Private
router.put('/change-password', [
    body('currentPassword')
        .notEmpty()
        .withMessage('Mật khẩu hiện tại là bắt buộc'),
    body('newPassword')
        .isLength({ min: 6 })
        .withMessage('Mật khẩu mới phải có ít nhất 6 ký tự'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Mật khẩu xác nhận không khớp');
            }
            return true;
        })
], handleValidationErrors, authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user._id;

        // Lấy user với password
        const user = await User.findById(userId).select('+password');
        
        // Kiểm tra mật khẩu hiện tại
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu hiện tại không đúng'
            });
        }

        // Cập nhật mật khẩu mới
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Đổi mật khẩu thành công'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đổi mật khẩu'
        });
    }
});

// @route   GET /api/user/stats
// @desc    Lấy thống kê của user
// @access  Private
router.get('/stats', authenticateToken, async (req, res) => {
    try {
        const user = req.user;
        
        res.json({
            success: true,
            data: {
                stats: user.stats,
                ecoScore: user.ecoScore,
                memberSince: user.createdAt
            }
        });

    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy thống kê'
        });
    }
});

// @route   GET /api/user/leaderboard
// @desc    Lấy bảng xếp hạng người dùng
// @access  Public
router.get('/leaderboard', async (req, res) => {
    try {
        const { limit = 10, sortBy = 'totalKg' } = req.query;
        
        const validSortFields = ['totalKg', 'totalEarnings', 'totalOrders'];
        const sortField = validSortFields.includes(sortBy) ? sortBy : 'totalKg';

        const users = await User.find({ isActive: true })
            .select('fullName stats ecoScore createdAt')
            .sort({ [`stats.${sortField}`]: -1 })
            .limit(parseInt(limit));

        res.json({
            success: true,
            data: {
                leaderboard: users,
                sortBy: sortField
            }
        });

    } catch (error) {
        console.error('Get leaderboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy bảng xếp hạng'
        });
    }
});

// @route   DELETE /api/user/account
// @desc    Xóa tài khoản (soft delete)
// @access  Private
router.delete('/account', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;

        // Soft delete - chỉ vô hiệu hóa tài khoản
        await User.findByIdAndUpdate(userId, { isActive: false });

        res.json({
            success: true,
            message: 'Tài khoản đã được xóa thành công'
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi xóa tài khoản'
        });
    }
});

// @route   GET /api/user/all
// @desc    Lấy danh sách tất cả user (Admin only)
// @access  Private/Admin
router.get('/all', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        let query = {};
        if (search) {
            query = {
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phone: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const users = await User.find(query)
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await User.countDocuments(query);

        res.json({
            success: true,
            data: {
                users,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalUsers: total,
                    hasNext: skip + users.length < total,
                    hasPrev: parseInt(page) > 1
                }
            }
        });

    } catch (error) {
        console.error('Get all users error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy danh sách user'
        });
    }
});

module.exports = router;
