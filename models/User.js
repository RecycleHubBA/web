const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: [true, 'Họ và tên là bắt buộc'],
        trim: true,
        maxlength: [100, 'Họ và tên không được vượt quá 100 ký tự']
    },
    email: {
        type: String,
        required: [true, 'Email là bắt buộc'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email không hợp lệ']
    },
    phone: {
        type: String,
        required: [true, 'Số điện thoại là bắt buộc'],
        unique: true,
        trim: true,
        match: [/^[0-9]{10,11}$/, 'Số điện thoại không hợp lệ']
    },
    password: {
        type: String,
        required: [true, 'Mật khẩu là bắt buộc'],
        minlength: [6, 'Mật khẩu phải có ít nhất 6 ký tự'],
        select: false // Không trả về password trong query mặc định
    },
    address: {
        type: String,
        required: [true, 'Địa chỉ là bắt buộc'],
        trim: true,
        maxlength: [500, 'Địa chỉ không được vượt quá 500 ký tự']
    },
    plasticType: {
        type: String,
        enum: ['pet', 'bag', 'box', 'all', ''],
        default: ''
    },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    stats: {
        totalKg: {
            type: Number,
            default: 0
        },
        totalEarnings: {
            type: Number,
            default: 0
        },
        totalOrders: {
            type: Number,
            default: 0
        }
    },
    points: {
        type: Number,
        default: 0,
        min: [0, 'Số điểm không được âm']
    },
    checkinStreak: {
        type: Number,
        default: 0,
        min: [0, 'Chuỗi điểm danh không được âm']
    },
    lastCheckin: {
        type: Date,
        default: null
    },
    wasteTransactions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Transaction'
    }],
    lastLogin: {
        type: Date,
        default: null
    }
}, {
    timestamps: true, // Tự động thêm createdAt và updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Virtual field để tính điểm thân thiện môi trường
userSchema.virtual('ecoScore').get(function() {
    const kg = this.stats.totalKg || 0;
    if (kg >= 1000) return 'Diamond';
    if (kg >= 500) return 'Gold';
    if (kg >= 100) return 'Silver';
    if (kg >= 10) return 'Bronze';
    return 'Newbie';
});

// Hash password trước khi lưu
userSchema.pre('save', async function(next) {
    // Chỉ hash password nếu nó được modify
    if (!this.isModified('password')) return next();
    
    try {
        // Hash password với salt rounds = 12
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method để so sánh password
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Method để lấy thông tin user (không bao gồm password)
userSchema.methods.getPublicProfile = function() {
    const userObject = this.toObject();
    delete userObject.password;
    return userObject;
};

// Index để tối ưu hóa tìm kiếm (email và phone đã có unique index)
userSchema.index({ createdAt: -1 });

// Static method để tìm user theo email hoặc phone
userSchema.statics.findByEmailOrPhone = function(identifier) {
    return this.findOne({
        $or: [
            { email: identifier.toLowerCase() },
            { phone: identifier }
        ]
    }).select('+password'); // Bao gồm password để so sánh
};

// Method để thêm điểm cho user
userSchema.methods.addPoints = async function(points, description, type = 'bonus') {
    const Transaction = require('./Transaction');
    
    const pointsBefore = this.points;
    this.points += points;
    const pointsAfter = this.points;
    
    // Tạo transaction record
    const transaction = new Transaction({
        userId: this._id,
        type: type,
        pointsEarned: points,
        pointsBefore: pointsBefore,
        pointsAfter: pointsAfter,
        description: description,
        status: 'completed'
    });
    
    await transaction.save();
    
    // Thêm transaction vào danh sách của user
    this.wasteTransactions.push(transaction._id);
    
    await this.save();
    return transaction;
};

// Method để đổi rác thành điểm
userSchema.methods.exchangeWasteForPoints = async function(wasteAmount, location = '', plasticType = '') {
    const Transaction = require('./Transaction');
    
    // Tính điểm
    const pointsCalculation = Transaction.calculatePoints(wasteAmount);
    
    const pointsBefore = this.points;
    this.points += pointsCalculation.totalPoints;
    const pointsAfter = this.points;
    
    // Cập nhật stats
    this.stats.totalKg += wasteAmount;
    this.stats.totalOrders += 1;
    
    // Tạo transaction record
    const transaction = new Transaction({
        userId: this._id,
        type: 'waste_exchange',
        wasteAmount: wasteAmount,
        pointsEarned: pointsCalculation.totalPoints,
        pointsBefore: pointsBefore,
        pointsAfter: pointsAfter,
        description: `Đổi ${wasteAmount}kg rác thành ${pointsCalculation.totalPoints} điểm`,
        location: location,
        status: 'completed',
        metadata: {
            plasticType: plasticType,
            bonusApplied: pointsCalculation.hasBonus,
            bonusAmount: pointsCalculation.bonusPoints
        }
    });
    
    await transaction.save();
    
    // Thêm transaction vào danh sách của user
    this.wasteTransactions.push(transaction._id);
    
    await this.save();
    return transaction;
};

// Method để điểm danh hàng ngày
userSchema.methods.dailyCheckin = async function() {
    const today = new Date();
    const lastCheckin = this.lastCheckin ? new Date(this.lastCheckin) : null;
    
    // Kiểm tra xem đã điểm danh hôm nay chưa
    if (lastCheckin && lastCheckin.toDateString() === today.toDateString()) {
        throw new Error('Bạn đã điểm danh hôm nay rồi!');
    }
    
    // Kiểm tra chuỗi điểm danh
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let points = 2; // Điểm cơ bản
    
    if (lastCheckin && lastCheckin.toDateString() === yesterday.toDateString()) {
        // Điểm danh liên tục
        this.checkinStreak += 1;
    } else {
        // Bắt đầu chuỗi mới
        this.checkinStreak = 1;
    }
    
    // Bonus cho cuối tuần (Thứ 7, Chủ nhật)
    const dayOfWeek = today.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Chủ nhật hoặc Thứ 7
        points = 5;
    }
    
    // Bonus cho chuỗi điểm danh dài
    if (this.checkinStreak >= 7) {
        points += 3; // Bonus 3 điểm cho chuỗi 7 ngày
    }
    
    const Transaction = require('./Transaction');
    const pointsBefore = this.points;
    this.points += points;
    const pointsAfter = this.points;
    
    // Tạo transaction record
    const transaction = new Transaction({
        userId: this._id,
        type: 'daily_checkin',
        pointsEarned: points,
        pointsBefore: pointsBefore,
        pointsAfter: pointsAfter,
        description: `Điểm danh ngày ${today.toLocaleDateString('vi-VN')} - Chuỗi ${this.checkinStreak} ngày`,
        status: 'completed',
        metadata: {
            checkinStreak: this.checkinStreak
        }
    });
    
    await transaction.save();
    
    // Thêm transaction vào danh sách của user
    this.wasteTransactions.push(transaction._id);
    
    // Cập nhật lastCheckin
    this.lastCheckin = today;
    
    await this.save();
    return transaction;
};

module.exports = mongoose.model('User', userSchema);
