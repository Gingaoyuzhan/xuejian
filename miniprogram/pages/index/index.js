// pages/index/index.js
/**
 * 首页 - 功能入口
 * 支持游客模式浏览，登录后展示完整功能
 */

import {
  USER_ROLE,
  hasRole,
  hasObservationCreatorRole,
  canAccessObservationModule
} from '../../utils/constants.js';
import { showToast } from '../../utils/util.js';

const app = getApp();

Page({
  /**
   * 页面数据
   */
  data: {
    userInfo: null,
    isLoggedIn: false,
    // 功能菜单列表
    menuList: [],
    // 统计数据
    stats: {
      pendingObservations: 0,
      pendingImprovements: 0,
      myObservations: 0,
      myImprovements: 0
    }
  },

  /**
   * 生命周期
   */
  onLoad() {
    // 不再强制跳转登录，允许游客浏览
  },

  onShow() {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });

    if (isLoggedIn) {
      this.setData({
        userInfo: app.globalData.userInfo
      });
      this.initMenuList();
      this.loadStats();
    }
  },

  /**
   * 游客点击登录按钮
   */
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  /**
   * 初始化功能菜单
   */
  initMenuList() {
    const userInfo = app.globalData.userInfo || {};
    const menuList = [];
    const pushMenu = (menu) => {
      if (!menuList.some(item => item.id === menu.id)) {
        menuList.push(menu);
      }
    };

    if (hasObservationCreatorRole(userInfo)) {
      pushMenu({
        id: 'create-observation',
        title: '创建听课记录',
        icon: '📝',
        desc: '记录听课情况和意见',
        url: '/pages/observation/create/create'
      });
    }
    pushMenu({
      id: 'create-improvement',
      title: '发起持续改进',
      icon: '📈',
      desc: '填写问题并发起整改',
      url: '/pages/improvement/create/create'
    });

    // 管理员专属功能
    if (hasRole(userInfo, USER_ROLE.ADMIN)) {
      pushMenu({
        id: 'audit-observation',
        title: '审核听课记录',
        icon: '✅',
        desc: '审核校领导、学校督导提交的听课记录',
        url: '/pages/observation/audit/audit'
      });
    }

    // 高教中心专属功能
    if (hasRole(userInfo, USER_ROLE.COLLEGE)) {
      pushMenu({
        id: 'observation-audit',
        title: '听课记录审核',
        icon: '📋',
        desc: '审核校领导、学校督导提交的听课记录',
        url: '/pages/observation/audit/audit'
      });
      pushMenu({
        id: 'college-check',
        title: '持续改进跟踪',
        icon: '📈',
        desc: '查看并检查持续改进事项',
        url: '/pages/improvement/list/list?filter=all'
      });
    }

    if (hasRole(userInfo, USER_ROLE.DEPARTMENT_LEADER)) {
      pushMenu({
        id: 'department-improvements',
        title: '本院持续改进',
        icon: '🏫',
        desc: '查看本院教师持续改进情况',
        url: '/pages/improvement/list/list?filter=department'
      });
    }

    this.setData({ menuList });
  },

  /**
   * 加载统计数据
   */
  async loadStats() {
    try {
      const { getStats } = require('../../utils/request.js');
      const userInfo = app.globalData.userInfo;
      const stats = await getStats({
        userId: userInfo.id,
        userRole: userInfo.role
      });
      this.setData({ stats });
    } catch (err) {
      console.error('加载统计数据失败:', err);
    }
  },

  /**
   * 点击菜单
   */
  handleMenuTap(e) {
    const { url } = e.currentTarget.dataset;
    if (url) {
      wx.navigateTo({ url });
    }
  },

  /**
   * 跳转到听课评课列表
   */
  goToObservationList() {
    if (this.data.isLoggedIn && !canAccessObservationModule(app.globalData.userInfo)) {
      showToast('听课记录由高教中心统一管理反馈', 'none');
      return;
    }
    wx.switchTab({
      url: '/pages/observation/list/list'
    });
  },

  /**
   * 跳转到持续改进列表
   */
  goToImprovementList() {
    wx.switchTab({
      url: '/pages/improvement/list/list'
    });
  }
});
