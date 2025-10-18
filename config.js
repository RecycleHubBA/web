// Load environment variables
require('dotenv').config();

module.exports = {
    // MongoDB Configuration
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb+srv://recyclehub_user:RecycleHub123@recyclehub.4xzcat7.mongodb.net/recyclehub?retryWrites=true&w=majority&appName=Recyclehub',
    
    // JWT Configuration
    JWT_SECRET: process.env.JWT_SECRET || 'your_super_secret_jwt_key_here_make_it_long_and_random_123456789',
    JWT_EXPIRE: process.env.JWT_EXPIRE || '7d',
    
    // Server Configuration
    PORT: process.env.PORT || 5000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    
    // Frontend URL
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    
    // Rate Limiting
    RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
};

