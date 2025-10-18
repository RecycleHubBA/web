const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();

// Helper function để tạo JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, config.JWT_SECRET, { 
        expiresIn: config.JWT_EXPIRE 
    });
};

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

// @route   POST /api/auth/register
// @desc    Đăng ký tài khoản mới
// @access  Public
router.post('/register', [
    body('fullName')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Họ và tên phải có từ 2-100 ký tự'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Email không hợp lệ'),
    body('phone')
        .matches(/^[0-9]{10,11}$/)
        .withMessage('Số điện thoại phải có 10-11 chữ số'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Mật khẩu xác nhận không khớp');
            }
            return true;
        }),
    body('address')
        .trim()
        .isLength({ min: 10, max: 500 })
        .withMessage('Địa chỉ phải có từ 10-500 ký tự'),
    body('plasticType')
        .optional()
        .isIn(['pet', 'bag', 'box', 'all', ''])
        .withMessage('Loại nhựa không hợp lệ')
], handleValidationErrors, async (req, res) => {
    try {
        const { fullName, email, phone, password, address, plasticType } = req.body;

        // Kiểm tra email hoặc phone đã tồn tại
        const existingUser = await User.findOne({
            $or: [{ email }, { phone }]
        });

        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: existingUser.email === email 
                    ? 'Email đã được sử dụng' 
                    : 'Số điện thoại đã được sử dụng'
            });
        }

        // Tạo user mới
        const user = new User({
            fullName,
            email,
            phone,
            password,
            address,
            plasticType: plasticType || ''
        });

        await user.save();

        // Tạo token
        const token = generateToken(user._id);

        // Cập nhật lastLogin
        user.lastLogin = new Date();
        await user.save();

        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công! Chào mừng bạn đến với RecycleHub!',
            data: {
                user: user.getPublicProfile(),
                token
            }
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đăng ký'
        });
    }
});

// @route   POST /api/auth/login
// @desc    Đăng nhập
// @access  Public
router.post('/login', [
    body('loginEmail')
        .notEmpty()
        .withMessage('Email hoặc số điện thoại là bắt buộc'),
    body('loginPassword')
        .notEmpty()
        .withMessage('Mật khẩu là bắt buộc')
], handleValidationErrors, async (req, res) => {
    try {
        const { loginEmail, loginPassword } = req.body;

        // Tìm user theo email hoặc phone
        const user = await User.findByEmailOrPhone(loginEmail);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Email/số điện thoại hoặc mật khẩu không đúng'
            });
        }

        // Kiểm tra tài khoản có bị vô hiệu hóa không
        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Tài khoản đã bị vô hiệu hóa'
            });
        }

        // So sánh password
        const isPasswordValid = await user.comparePassword(loginPassword);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Email/số điện thoại hoặc mật khẩu không đúng'
            });
        }

        // Cập nhật lastLogin
        user.lastLogin = new Date();
        await user.save();

        // Tạo token
        const token = generateToken(user._id);

        res.json({
            success: true,
            message: 'Đăng nhập thành công!',
            data: {
                user: user.getPublicProfile(),
                token
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đăng nhập'
        });
    }
});

// @route   GET /api/auth/me
// @desc    Lấy thông tin user hiện tại
// @access  Private
router.get('/me', authenticateToken, async (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                user: req.user.getPublicProfile()
            }
        });
    } catch (error) {
        console.error('Get user info error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi lấy thông tin user'
        });
    }
});

// @route   POST /api/auth/refresh
// @desc    Làm mới token
// @access  Private
router.post('/refresh', authenticateToken, async (req, res) => {
    try {
        const token = generateToken(req.user._id);
        
        res.json({
            success: true,
            message: 'Token đã được làm mới',
            data: {
                token
            }
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi làm mới token'
        });
    }
});

// @route   POST /api/auth/logout
// @desc    Đăng xuất (client-side sẽ xóa token)
// @access  Private
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        // Trong thực tế, có thể lưu token vào blacklist
        // Ở đây chỉ trả về response thành công
        res.json({
            success: true,
            message: 'Đăng xuất thành công'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đăng xuất'
        });
    }
});

module.exports = router;
