const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config');

// Middleware xác thực JWT
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token truy cập không được cung cấp'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, config.JWT_SECRET);
        
        // Tìm user trong database
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ - người dùng không tồn tại'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Tài khoản đã bị vô hiệu hóa'
            });
        }

        // Thêm thông tin user vào request
        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token đã hết hạn'
            });
        }

        console.error('Auth middleware error:', error);
        return res.status(500).json({
            success: false,
            message: 'Lỗi xác thực'
        });
    }
};

// Middleware kiểm tra quyền admin
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).json({
            success: false,
            message: 'Bạn không có quyền truy cập tài nguyên này'
        });
    }
};

// Middleware tùy chọn - không bắt buộc token
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, config.JWT_SECRET);
            const user = await User.findById(decoded.userId);
            if (user && user.isActive) {
                req.user = user;
            }
        }
        next();
    } catch (error) {
        // Bỏ qua lỗi và tiếp tục
        next();
    }
};

module.exports = {
    authenticateToken,
    requireAdmin,
    optionalAuth
};
