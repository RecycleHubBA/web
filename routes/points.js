const express = require('express');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Rate limiting for points operations
const pointsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // limit each IP to 20 points operations per windowMs
    message: 'Quá nhiều thao tác với điểm, vui lòng thử lại sau.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true
});

// Rate limiting for exchange waste (stricter)
const exchangeLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // limit each IP to 10 waste exchanges per hour
    message: 'Quá nhiều lần đổi rác, vui lòng thử lại sau 1 giờ.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true
});

// Rate limiting for daily checkin
const checkinLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 3, // limit each IP to 3 checkins per day (safety measure)
    message: 'Quá nhiều lần thử điểm danh, vui lòng thử lại sau.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true
});

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

// Middleware để validate user permissions
const validateUserPermissions = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }
        
        if (!user.isActive) {
            return res.status(403).json({
                success: false,
                message: 'Tài khoản đã bị vô hiệu hóa'
            });
        }
        
        // Thêm user vào request để sử dụng trong các route khác
        req.userData = user;
        next();
    } catch (error) {
        console.error('Validate user permissions error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi xác thực quyền người dùng'
        });
    }
};

// @route   POST /api/points/exchange-waste
// @desc    Đổi rác thành điểm
// @access  Private
router.post('/exchange-waste', exchangeLimiter, [
    body('wasteAmount')
        .isFloat({ min: 0.1, max: 1000 })
        .withMessage('Số kg rác phải từ 0.1 đến 1000kg'),
    body('location')
        .optional()
        .trim()
        .isLength({ max: 200 })
        .withMessage('Địa điểm không được vượt quá 200 ký tự'),
    body('plasticType')
        .optional()
        .isIn(['pet', 'bag', 'box', 'all', ''])
        .withMessage('Loại nhựa không hợp lệ')
], handleValidationErrors, authenticateToken, validateUserPermissions, async (req, res) => {
    try {
        console.log('Exchange waste request:', req.body);
        
        const { wasteAmount, location = '', plasticType = '' } = req.body;
        const user = req.userData; // Đã được validate trong middleware

        console.log('User data:', {
            userId: user._id,
            currentPoints: user.points,
            wasteAmount: wasteAmount,
            location: location,
            plasticType: plasticType
        });

        // Log giao dịch để audit
        console.log(`[EXCHANGE] User ${user._id} exchanging ${wasteAmount}kg waste at ${new Date().toISOString()}`);
        
        // Đổi rác thành điểm
        console.log('Calling exchangeWasteForPoints...');
        const transaction = await user.exchangeWasteForPoints(
            parseFloat(wasteAmount), 
            location, 
            plasticType
        );
        console.log('Transaction created:', transaction._id);

        // Lấy thông tin user đã cập nhật
        console.log('Populating user data...');
        await user.populate('wasteTransactions');
        const updatedUser = await User.findById(user._id);
        console.log('Updated user points:', updatedUser.points);

        const responseData = {
            success: true,
            message: `Đổi ${wasteAmount}kg rác thành công! Nhận được ${transaction.pointsEarned} điểm.`,
            data: {
                transaction: transaction.getDetails(),
                user: updatedUser.getPublicProfile()
            }
        };

        console.log('Sending response:', responseData);
        res.status(201).json(responseData);

    } catch (error) {
        console.error('Exchange waste error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Xử lý các lỗi cụ thể
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                details: error.message
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Giao dịch đã tồn tại'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đổi rác thành điểm',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Có lỗi xảy ra'
        });
    }
});

// @route   POST /api/points/daily-checkin
// @desc    Điểm danh hàng ngày
// @access  Private
router.post('/daily-checkin', checkinLimiter, authenticateToken, validateUserPermissions, async (req, res) => {
    try {
        const user = req.userData; // Đã được validate trong middleware

        // Log điểm danh để audit
        console.log(`[CHECKIN] User ${user._id} daily checkin at ${new Date().toISOString()}`);
        
        // Điểm danh
        const transaction = await user.dailyCheckin();

        // Lấy thông tin user đã cập nhật
        const updatedUser = await User.findById(user._id);

        res.status(201).json({
            success: true,
            message: `Điểm danh thành công! Nhận được ${transaction.pointsEarned} điểm. Chuỗi điểm danh: ${user.checkinStreak} ngày.`,
            data: {
                transaction: transaction.getDetails(),
                user: updatedUser.getPublicProfile(),
                checkinStreak: user.checkinStreak
            }
        });

    } catch (error) {
        console.error('Daily checkin error:', error);
        
        if (error.message.includes('đã điểm danh hôm nay')) {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi server khi điểm danh'
        });
    }
});

// @route   GET /api/points/calculator
// @desc    Tính điểm dựa trên số kg rác (không lưu giao dịch)
// @access  Public
router.get('/calculator', [
    body('wasteAmount')
        .isFloat({ min: 0, max: 1000 })
        .withMessage('Số kg rác phải từ 0 đến 1000kg')
], handleValidationErrors, async (req, res) => {
    try {
        const { wasteAmount } = req.query;
        
        if (!wasteAmount) {
            return res.status(400).json({
                success: false,
                message: 'Số kg rác là bắt buộc'
            });
        }

        const pointsCalculation = Transaction.calculatePoints(wasteAmount);

        res.json({
            success: true,
            data: {
                wasteAmount: parseFloat(wasteAmount),
                pointsCalculation: pointsCalculation,
                message: pointsCalculation.hasBonus 
                    ? `Nhận được ${pointsCalculation.totalPoints} điểm (${pointsCalculation.basePoints} điểm cơ bản + ${pointsCalculation.bonusPoints} điểm bonus)`
                    : `Nhận được ${pointsCalculation.totalPoints} điểm`
            }
        });

    } catch (error) {
        console.error('Points calculator error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi tính điểm'
        });
    }
});

// @route   GET /api/points/user-stats
// @desc    Lấy thống kê điểm của user hiện tại
// @access  Private
router.get('/user-stats', pointsLimiter, authenticateToken, validateUserPermissions, async (req, res) => {
    try {
        console.log('Getting user stats for user:', req.user._id);
        const user = req.userData; // Đã được validate trong middleware

        console.log('User data:', {
            userId: user._id,
            points: user.points,
            checkinStreak: user.checkinStreak,
            lastCheckin: user.lastCheckin
        });

        // Lấy thống kê từ Transaction model
        console.log('Fetching transaction stats...');
        const transactionStats = await Transaction.getUserStats(user._id);
        console.log('Transaction stats:', transactionStats);

        const responseData = {
            success: true,
            data: {
                currentPoints: user.points,
                checkinStreak: user.checkinStreak,
                lastCheckin: user.lastCheckin,
                transactionStats: transactionStats,
                userStats: user.stats
            }
        };

        console.log('Sending user stats response:', responseData);
        res.json(responseData);

    } catch (error) {
        console.error('Get user stats error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy thống kê điểm',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Có lỗi xảy ra'
        });
    }
});

// @route   GET /api/points/transactions
// @desc    Lấy lịch sử giao dịch của user hiện tại
// @access  Private
router.get('/transactions', pointsLimiter, authenticateToken, validateUserPermissions, async (req, res) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 20, type = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Xây dựng query
        let query = { userId: userId, status: 'completed' };
        if (type && ['waste_exchange', 'daily_checkin', 'bonus', 'redemption'].includes(type)) {
            query.type = type;
        }

        // Lấy transactions với pagination
        const transactions = await Transaction.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        // Đếm tổng số transactions
        const total = await Transaction.countDocuments(query);

        // Format transactions
        const formattedTransactions = transactions.map(transaction => transaction.getDetails());

        res.json({
            success: true,
            data: {
                transactions: formattedTransactions,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalTransactions: total,
                    hasNext: skip + transactions.length < total,
                    hasPrev: parseInt(page) > 1
                }
            }
        });

    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy lịch sử giao dịch'
        });
    }
});

// @route   POST /api/points/redeem-voucher
// @desc    Đổi điểm lấy voucher
// @access  Private
router.post('/redeem-voucher', [
    body('voucherType')
        .optional()
        .isIn(['shopping', 'ecommerce', 'food', 'entertainment'])
        .withMessage('Loại voucher không hợp lệ'),
    body('pointsRequired')
        .isInt({ min: 100, max: 10000 })
        .withMessage('Số điểm phải từ 100 đến 10000'),
    body('voucherValue')
        .isInt({ min: 10000, max: 1000000 })
        .withMessage('Giá trị voucher phải từ 10.000 đến 1.000.000 VNĐ'),
    body('voucherName')
        .optional()
        .isLength({ min: 1, max: 100 })
        .withMessage('Tên voucher phải từ 1-100 ký tự'),
    body('voucherDescription')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Mô tả voucher không được vượt quá 500 ký tự'),
    body('iconClass')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Icon class không hợp lệ')
], handleValidationErrors, authenticateToken, validateUserPermissions, async (req, res) => {
    try {
        console.log('Redeem voucher request:', req.body);
        
        const { voucherType, pointsRequired, voucherValue, voucherName, voucherDescription, iconClass } = req.body;
        const user = req.userData;

        console.log('User data:', {
            userId: user._id,
            currentPoints: user.points,
            pointsRequired: pointsRequired
        });

        // Kiểm tra đủ điểm không
        if (user.points < pointsRequired) {
            return res.status(400).json({
                success: false,
                message: `Không đủ điểm! Bạn cần ${pointsRequired} điểm để đổi voucher này.`
            });
        }

        // Tạo voucher code unique
        console.log('Generating voucher code...');
        const voucherCode = await Transaction.generateUniqueVoucherCode();
        console.log('Generated voucher code:', voucherCode);

        // Tạo transaction cho việc đổi voucher
        const transactionData = {
            userId: user._id,
            type: 'redemption',
            pointsEarned: -pointsRequired, // Trừ điểm
            pointsBefore: user.points,
            pointsAfter: user.points - pointsRequired,
            description: `Đổi ${pointsRequired} điểm lấy voucher ${voucherName || 'Voucher mua sắm'}`,
            status: 'completed',
            voucherCode: voucherCode,
            voucherDetails: {
                name: voucherName || 'Voucher mua sắm',
                value: voucherValue,
                description: voucherDescription || 'Voucher mua sắm tại cửa hàng đối tác',
                iconClass: iconClass || 'fas fa-ticket-alt'
            }
        };

        console.log('Creating transaction with data:', transactionData);
        const transaction = new Transaction(transactionData);

        console.log('Saving transaction...');
        await transaction.save();
        console.log('Transaction saved successfully');

        // Cập nhật điểm của user
        console.log('Updating user points...');
        user.points -= pointsRequired;
        user.wasteTransactions.push(transaction._id);
        await user.save();
        console.log('User updated successfully');

        const responseData = {
            success: true,
            message: `Đổi voucher thành công! Mã voucher: ${voucherCode}`,
            data: {
                transaction: transaction.getDetails(),
                user: user.getPublicProfile(),
                voucherCode: voucherCode
            }
        };

        console.log('Sending success response:', responseData);
        res.status(201).json(responseData);

    } catch (error) {
        console.error('Redeem voucher error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        
        // Xử lý các lỗi cụ thể
        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu voucher không hợp lệ',
                details: error.message
            });
        }
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Mã voucher đã tồn tại, vui lòng thử lại'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đổi voucher',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Có lỗi xảy ra'
        });
    }
});

// @route   GET /api/points/vouchers
// @desc    Lấy danh sách voucher đã đổi của user
// @access  Private
router.get('/vouchers', pointsLimiter, authenticateToken, validateUserPermissions, async (req, res) => {
    try {
        const userId = req.user._id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        // Lấy transactions có voucher code
        const vouchers = await Transaction.find({ 
            userId: userId, 
            type: 'redemption',
            voucherCode: { $exists: true, $ne: null },
            status: 'completed'
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

        // Đếm tổng số vouchers
        const total = await Transaction.countDocuments({ 
            userId: userId, 
            type: 'redemption',
            voucherCode: { $exists: true, $ne: null },
            status: 'completed'
        });

        // Format vouchers
        const formattedVouchers = vouchers.map(voucher => ({
            id: voucher._id,
            voucherCode: voucher.voucherCode,
            voucherDetails: voucher.voucherDetails,
            pointsUsed: Math.abs(voucher.pointsEarned),
            redeemedAt: voucher.createdAt,
            status: voucher.status
        }));

        res.json({
            success: true,
            data: {
                vouchers: formattedVouchers,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalVouchers: total,
                    hasNext: skip + vouchers.length < total,
                    hasPrev: parseInt(page) > 1
                }
            }
        });

    } catch (error) {
        console.error('Get vouchers error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy danh sách voucher'
        });
    }
});

// @route   GET /api/points/leaderboard
// @desc    Lấy bảng xếp hạng theo điểm
// @access  Public
router.get('/leaderboard', async (req, res) => {
    try {
        const { limit = 10 } = req.query;

        const users = await User.find({ isActive: true })
            .select('fullName points stats checkinStreak createdAt')
            .sort({ points: -1 })
            .limit(parseInt(limit));

        const leaderboard = users.map((user, index) => ({
            rank: index + 1,
            fullName: user.fullName,
            points: user.points,
            totalKg: user.stats.totalKg,
            checkinStreak: user.checkinStreak,
            ecoScore: user.ecoScore,
            memberSince: user.createdAt
        }));

        res.json({
            success: true,
            data: {
                leaderboard: leaderboard,
                totalUsers: await User.countDocuments({ isActive: true })
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

module.exports = router;
