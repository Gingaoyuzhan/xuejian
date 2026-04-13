// app.js
import { normalizeRoles, getPrimaryRole } from './utils/constants.js';

const PROD_API_BASE_URL = 'https://jxjd.gaoyuzhan.top/api';

App({
  globalData: {
    userInfo: null,
    isLoggedIn: false,
    userRole: null, // supervisor(督导) / teacher(教师) / admin(管理员) / college(高教中心) / department_leader(校领导)
    userRoles: [],
    apiBaseUrl: PROD_API_BASE_URL
  },

  onLaunch() {
    wx.removeStorageSync('apiBaseUrl');
    wx.removeStorageSync('apiBaseUrlMode');
    this.globalData.apiBaseUrl = PROD_API_BASE_URL;
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
