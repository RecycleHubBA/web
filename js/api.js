// RecycleHub API Client
class RecycleHubAPI {
    constructor() {
        // Auto-detect environment and set appropriate API URL
        const isProduction = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
        this.baseURL = isProduction 
            ? 'recyclehub-production-aba0.up.railway.app/api'  // Thay bằng URL backend production của bạn
            : 'http://localhost:5000/api';
        this.token = localStorage.getItem('recyclehub_token');
    }

    // Helper method để tạo headers
    getHeaders(includeAuth = true) {
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        
        if (includeAuth && this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        return headers;
    }

    // Helper method để tạo fetch options chuẩn
    getFetchOptions(method = 'GET', body = null, includeAuth = true) {
        const options = {
            method: method,
            mode: 'cors',
            credentials: 'include',
            headers: this.getHeaders(includeAuth)
        };
        
        if (body) {
            options.body = JSON.stringify(body);
        }
        
        return options;
    }

    // Helper method để xử lý response
    async handleResponse(response) {
        // Kiểm tra nếu response không ok
        if (!response.ok) {
            let errorMessage = 'Có lỗi xảy ra';
            
            try {
                const data = await response.json();
                errorMessage = data.message || errorMessage;
            } catch (e) {
                // Nếu không parse được JSON, sử dụng status text
                errorMessage = response.statusText || errorMessage;
            }
            
            // Xử lý các lỗi CORS cụ thể
            if (response.status === 0 || response.type === 'opaque') {
                errorMessage = 'Lỗi CORS: Không thể kết nối đến server. Vui lòng kiểm tra cấu hình CORS.';
            }
            
            throw new Error(errorMessage);
        }
        
        try {
            const data = await response.json();
            return data;
        } catch (e) {
            throw new Error('Lỗi parse JSON response');
        }
    }

    // Authentication methods
    async register(userData) {
        try {
           const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/auth/register', 
                this.getFetchOptions('POST', userData, false)
            );

            const result = await this.handleResponse(response);
            
            if (result.success && result.data.token) {
                this.token = result.data.token;
                localStorage.setItem('recyclehub_token', this.token);
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async login(loginData) {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/auth/login', 
                this.getFetchOptions('POST', loginData, false)
            );

            const result = await this.handleResponse(response);
            
            if (result.success && result.data.token) {
                this.token = result.data.token;
                localStorage.setItem('recyclehub_token', this.token);
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getCurrentUser() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/auth/me', 
                this.getFetchOptions('GET')
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            // Nếu token không hợp lệ, xóa token và user data
            this.logout();
            throw new Error(error.message);
        }
    }

    async refreshToken() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/auth/refresh', 
                this.getFetchOptions('POST')
            );

            const result = await this.handleResponse(response);
            
            if (result.success && result.data.token) {
                this.token = result.data.token;
                localStorage.setItem('recyclehub_token', this.token);
            }
            
            return result;
        } catch (error) {
            this.logout();
            throw new Error(error.message);
        }
    }

    async logout() {
        try {
            if (this.token) {
                await fetch('https://recyclehub-production-aba0.up.railway.app/api/auth/logout', 
                    this.getFetchOptions('POST')
                );
            }
        } catch (error) {
            console.warn('Logout API call failed:', error);
        } finally {
            // Luôn xóa token và user data
            this.token = null;
            localStorage.removeItem('recyclehub_token');
            localStorage.removeItem('recyclehub_user');
        }
    }

    // User management methods
    async updateProfile(profileData) {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/user/profile', 
                this.getFetchOptions('PUT', profileData)
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async changePassword(passwordData) {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/user/change-password', 
                this.getFetchOptions('PUT', passwordData)
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getUserStats() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/user/stats', 
                this.getFetchOptions('GET')
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getLeaderboard(options = {}) {
        try {
            const params = new URLSearchParams(options);
            const response = await fetch(`https://recyclehub-production-aba0.up.railway.app/api/user/leaderboard?${params}`, 
                this.getFetchOptions('GET', null, false)
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async deleteAccount() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/user/account', 
                this.getFetchOptions('DELETE')
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                this.logout();
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    // Points system methods
    async exchangeWasteForPoints(wasteData) {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/points/exchange-waste', 
                this.getFetchOptions('POST', wasteData)
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                // Cập nhật user data trong localStorage
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async dailyCheckin() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/points/daily-checkin', 
                this.getFetchOptions('POST')
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                // Cập nhật user data trong localStorage
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async calculatePoints(wasteAmount) {
        try {
            const response = await fetch(`https://recyclehub-production-aba0.up.railway.app/api/points/calculator?wasteAmount=${wasteAmount}`, 
                this.getFetchOptions('GET', null, false)
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getUserPointsStats() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/points/user-stats', 
                this.getFetchOptions('GET')
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getUserTransactions(options = {}) {
        try {
            const params = new URLSearchParams(options);
            const response = await fetch(`https://recyclehub-production-aba0.up.railway.app/api/points/transactions?${params}`, 
                this.getFetchOptions('GET')
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getPointsLeaderboard(options = {}) {
        try {
            const params = new URLSearchParams(options);
            const response = await fetch(`https://recyclehub-production-aba0.up.railway.app/api/points/leaderboard?${params}`, 
                this.getFetchOptions('GET', null, false)
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    // Voucher methods
    async redeemVoucher(voucherData) {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/points/redeem-voucher', 
                this.getFetchOptions('POST', voucherData)
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                // Cập nhật user data trong localStorage
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }

    async getUserVouchers(options = {}) {
        try {
            const params = new URLSearchParams(options);
            const response = await fetch(`https://recyclehub-production-aba0.up.railway.app/api/points/vouchers?${params}`, 
                this.getFetchOptions('GET')
            );

            return await this.handleResponse(response);
        } catch (error) {
            throw new Error(error.message);
        }
    }

    // Voucher methods
    async redeemVoucher(voucherData) {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/points/redeem-voucher', 
                this.getFetchOptions('POST', voucherData)
            );

            const result = await this.handleResponse(response);
            
            if (result.success) {
                // Cập nhật user data trong localStorage
                localStorage.setItem('recyclehub_user', JSON.stringify(result.data.user));
            }
            
            return result;
        } catch (error) {
            throw new Error(error.message);
        }
    }


    // Health check
    async healthCheck() {
        try {
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/health', {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            return await this.handleResponse(response);
        } catch (error) {
            console.error('Health check failed:', error);
            throw new Error('Server không khả dụng: ' + error.message);
        }
    }

    // Test CORS connection
    async testCorsConnection() {
        try {
            console.log('Testing CORS connection...');
            const response = await fetch('https://recyclehub-production-aba0.up.railway.app/api/health', {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });
            
            console.log('CORS test response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('CORS test successful:', data);
                return { success: true, data };
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('CORS test failed:', error);
            return { success: false, error: error.message };
        }
    }

    // Utility methods
    isLoggedIn() {
        return !!this.token;
    }

    getCurrentUserData() {
        const userData = localStorage.getItem('recyclehub_user');
        return userData ? JSON.parse(userData) : null;
    }

    // Initialize token from localStorage
    init() {
        this.token = localStorage.getItem('recyclehub_token');
    }
}

// Tạo instance global
window.RecycleHubAPI = new RecycleHubAPI();
