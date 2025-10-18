const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const pointsRoutes = require('./routes/points');

const app = express();
const PORT = config.PORT;
// Trust proxy for Railway deployment
app.set('trust proxy', 1);

// Debug middleware for proxy headers
app.use((req, res, next) => {
    console.log('🔍 Request Info:', {
        ip: req.ip,
        ips: req.ips,
        xForwardedFor: req.get('X-Forwarded-For'),
        xRealIp: req.get('X-Real-IP'),
        userAgent: req.get('User-Agent')
    });
    next();
});

// Middleware
app.use(helmet());
// Cấu hình CORS chi tiết hơn
const corsOptions = {
    origin: function (origin, callback) {
        // Cho phép requests không có origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'http://localhost:3000',
            'http://127.0.0.1:3000',
            'http://localhost:5000',
            'http://127.0.0.1:5000',
            'file://',
            'null',
            'https://kiritodark2k6.github.io',
            'https://kiritodark2k6.github.io/RecycleHub',
            'https://kiritodark2k6.github.io/RecycleHub/',
            'https://kiritodark2k6.github.io/RecycleHub-main/',
            'https://kiritodark2k6.github.io/RecycleHub-main/',
            /^https:\/\/.*\.github\.io$/,  // Tất cả GitHub Pages subdomains
            /^https:\/\/.*\.vercel\.app$/, // Vercel deployments
            /^https:\/\/.*\.netlify\.app$/ // Netlify deployments
        ];
        
        // Kiểm tra origin có trong danh sách cho phép không
        const isAllowed = allowedOrigins.some(allowedOrigin => {
            if (typeof allowedOrigin === 'string') {
                return origin === allowedOrigin;
            } else if (allowedOrigin instanceof RegExp) {
                return allowedOrigin.test(origin);
            }
            return false;
        });
        
        if (isAllowed) {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Requested-With',
        'Accept',
        'Origin',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['Authorization'],
    optionsSuccessStatus: 200,
    preflightContinue: false
};

app.use(cors(corsOptions));

// Middleware xử lý preflight requests một cách rõ ràng
app.use((req, res, next) => {
    // Xử lý preflight requests
    if (req.method === 'OPTIONS') {
        res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
        return res.status(200).end();
    }
    next();
});
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    trustProxy: true // Trust proxy for Railway
});
app.use(limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // limit each IP to 50 auth requests per windowMs (tăng từ 5 lên 50)
    message: 'Quá nhiều lần thử đăng nhập, vui lòng thử lại sau 15 phút.',
    standardHeaders: true,
    legacyHeaders: false,
    trustProxy: true
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/points', pointsRoutes);
// Serve static files (after API routes)
app.use(express.static('.'));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        message: 'RecycleHub API đang hoạt động',
        timestamp: new Date().toISOString()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Lỗi server nội bộ',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Có lỗi xảy ra'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint không tồn tại'
    });
});

// MongoDB connection options
const mongooseOptions = {
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
};
// MongoDB connection
mongoose.connect(config.MONGODB_URI, mongooseOptions)
.then(() => {
    console.log('✅ Kết nối MongoDB Atlas thành công');
    console.log(`📊 Database: ${mongoose.connection.name}`);
    console.log(`🌐 Host: ${mongoose.connection.host}`);
    
    app.listen(PORT, () => {
        console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
        console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
        console.log(`🔗 MongoDB Atlas: Đã kết nối thành công`);
    });
})
.catch((error) => {
    console.error('❌ Lỗi kết nối MongoDB Atlas:', error.message);
    console.error('💡 Kiểm tra lại connection string và network access trong MongoDB Atlas');
    process.exit(1);
});

// MongoDB connection events
mongoose.connection.on('connected', () => {
    console.log('🔗 Mongoose đã kết nối tới MongoDB Atlas');
});

mongoose.connection.on('error', (err) => {
    console.error('❌ Lỗi Mongoose:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('⚠️ Mongoose đã ngắt kết nối khỏi MongoDB Atlas');
});

// Graceful shutdown
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('🔒 Kết nối MongoDB đã được đóng do ứng dụng kết thúc');
        process.exit(0);
    } catch (error) {
        console.error('❌ Lỗi khi đóng kết nối MongoDB:', error);
        process.exit(1);
    }
});

module.exports = app;
