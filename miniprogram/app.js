// app.js
import { normalizeRoles, getPrimaryRole } from './utils/constants.js';

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    userRole: null, // supervisor(督导) / teacher(教师) / admin(管理员) / college(高教中心) / department_leader(二级学院领导)
    userRoles: [],
    // 后端 API 基础地址（开发环境使用本地，生产环境替换为服务器地址）
    apiBaseUrl: 'http://localhost:3000/api'
  },

  onLaunch() {
    // 检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus() {
    const userInfo = wx.getStorageSync('userInfo');
    const token = wx.getStorageSync('token');
    if (userInfo && token) {
      const normalizedUserInfo = {
        ...userInfo,
        roles: normalizeRoles(userInfo),
        role: getPrimaryRole(userInfo)
      };
      this.globalData.userInfo = normalizedUserInfo;
      this.globalData.isLoggedIn = true;
      this.globalData.userRole = normalizedUserInfo.role;
      this.globalData.userRoles = normalizedUserInfo.roles;
    }
  },

  // 设置用户信息
  setUserInfo(userInfo) {
    const normalizedUserInfo = {
      ...userInfo,
      roles: normalizeRoles(userInfo),
      role: getPrimaryRole(userInfo)
    };
    this.globalData.userInfo = normalizedUserInfo;
    this.globalData.isLoggedIn = true;
    this.globalData.userRole = normalizedUserInfo.role;
    this.globalData.userRoles = normalizedUserInfo.roles;
    wx.setStorageSync('userInfo', normalizedUserInfo);
    if (normalizedUserInfo.token) {
      wx.setStorageSync('token', normalizedUserInfo.token);
    }
  },

  // 清除用户信息（退出登录）
  clearUserInfo() {
    this.globalData.userInfo = null;
    this.globalData.isLoggedIn = false;
    this.globalData.userRole = null;
    this.globalData.userRoles = [];
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('token');
  }
});
