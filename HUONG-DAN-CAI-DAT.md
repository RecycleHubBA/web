# Hướng Dẫn Cài Đặt RecycleHub với MongoDB

## 📋 Yêu cầu hệ thống

- **Node.js**: >= 16.0.0
- **MongoDB**: >= 4.4 (Local hoặc MongoDB Atlas)
- **npm**: >= 8.0.0

## 🚀 Cài đặt Backend

### Bước 1: Cài đặt dependencies
```bash
# Di chuyển vào thư mục dự án
cd RecycleHub-main

# Cài đặt các package cần thiết
npm install
```

### Bước 2: Cài đặt MongoDB

#### Tùy chọn A: MongoDB Local
```bash
# Windows (với Chocolatey)
choco install mongodb

# macOS (với Homebrew)
brew install mongodb-community

# Ubuntu/Debian
sudo apt-get install mongodb

# Khởi động MongoDB
mongod
```

#### Tùy chọn B: MongoDB Atlas (Cloud)
1. Truy cập [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Tạo tài khoản miễn phí
3. Tạo cluster mới
4. Lấy connection string
5. Cập nhật `MONGODB_URI` trong `config.js`

### Bước 3: Cấu hình
Chỉnh sửa file `config.js`:
```javascript
module.exports = {
    // Thay đổi URL MongoDB nếu cần
    MONGODB_URI: 'mongodb://localhost:27017/recyclehub',
    
    // Thay đổi JWT secret cho production
    JWT_SECRET: 'your_super_secret_jwt_key_here',
    
    // Cấu hình port
    PORT: 5000,
    
    // URL frontend
    FRONTEND_URL: 'http://localhost:3000'
};
```

### Bước 4: Chạy Backend
```bash
# Development mode (tự động restart khi có thay đổi)
npm run dev

# Production mode
npm start
```

Backend sẽ chạy tại: `http://localhost:5000`

## 🌐 Chạy Frontend

### Bước 1: Mở file HTML
```bash
# Mở file index.html trong trình duyệt
# Hoặc sử dụng live server
npx live-server
```

### Bước 2: Kiểm tra kết nối
- Mở Developer Tools (F12)
- Kiểm tra Console để xem có lỗi kết nối API không
- Test đăng ký/đăng nhập

## 🧪 Test API

### Test Health Check
```bash
curl http://localhost:5000/api/health
```

### Test Đăng ký
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Nguyễn Văn A",
    "email": "test@example.com",
    "phone": "0123456789",
    "password": "123456",
    "confirmPassword": "123456",
    "address": "123 Đường ABC, Quận 1, TP.HCM",
    "plasticType": "pet",
    "agreeTerms": "true"
  }'
```

### Test Đăng nhập
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "loginEmail": "test@example.com",
    "loginPassword": "123456"
  }'
```

## 🔧 Troubleshooting

### Lỗi kết nối MongoDB
```
❌ Lỗi kết nối MongoDB: MongoNetworkError
```
**Giải pháp:**
- Kiểm tra MongoDB có đang chạy không
- Kiểm tra URL kết nối trong `config.js`
- Kiểm tra firewall/port 27017

### Lỗi CORS
```
Access to fetch at 'http://localhost:5000' from origin 'http://localhost:3000' has been blocked by CORS policy
```
**Giải pháp:**
- Kiểm tra `FRONTEND_URL` trong `config.js`
- Đảm bảo frontend và backend chạy trên đúng port

### Lỗi JWT
```
Token không hợp lệ
```
**Giải pháp:**
- Xóa localStorage: `localStorage.clear()`
- Đăng nhập lại
- Kiểm tra JWT_SECRET trong `config.js`

### Lỗi Validation
```
Dữ liệu đầu vào không hợp lệ
```
**Giải pháp:**
- Kiểm tra format email, phone
- Đảm bảo password >= 6 ký tự
- Kiểm tra các trường bắt buộc

## 📊 Kiểm tra Database

### Kết nối MongoDB Shell
```bash
# Local MongoDB
mongo recyclehub

# MongoDB Atlas
mongo "mongodb+srv://cluster0.xxxxx.mongodb.net/recyclehub"
```

### Xem dữ liệu Users
```javascript
// Xem tất cả users
db.users.find().pretty()

// Đếm số users
db.users.countDocuments()

// Xem user theo email
db.users.findOne({email: "test@example.com"})
```

## 🚀 Deployment

### Production Environment
1. **Cài đặt PM2:**
```bash
npm install -g pm2
```

2. **Tạo ecosystem file:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'recyclehub-api',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000,
      MONGODB_URI: 'mongodb://your-production-db',
      JWT_SECRET: 'your-super-secure-secret'
    }
  }]
}
```

3. **Chạy với PM2:**
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

## 📝 Logs và Monitoring

### Xem logs
```bash
# PM2 logs
pm2 logs recyclehub-api

# Real-time logs
pm2 logs recyclehub-api --lines 100 -f
```

### Monitor
```bash
# PM2 monitor
pm2 monit

# System info
pm2 show recyclehub-api
```

## 🔐 Security Checklist

- [ ] Thay đổi JWT_SECRET mặc định
- [ ] Sử dụng HTTPS trong production
- [ ] Cấu hình CORS đúng
- [ ] Enable rate limiting
- [ ] Backup database định kỳ
- [ ] Monitor logs và errors

## 📞 Hỗ trợ

Nếu gặp vấn đề, hãy kiểm tra:
1. Console logs trong browser (F12)
2. Server logs trong terminal
3. MongoDB connection status
4. Network connectivity

**Lưu ý:** Đảm bảo MongoDB đang chạy trước khi start backend server!
