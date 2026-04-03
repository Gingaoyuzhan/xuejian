// pages/observation/audit/audit.js
/**
 * 听课记录审核列表页（高教中心）
 */

import { getObservationList } from '../../../utils/request.js';
import { showToast, formatDate } from '../../../utils/util.js';
import { USER_ROLE, hasAnyRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  data: {
    list: [],
    loading: false,
    refreshing: false
  },

  onLoad() {
    if (!this.checkLogin()) return;
    this.loadData();
  },

  onPullDownRefresh() {
    this.refreshData();
  },

  checkLogin() {
    if (!app.globalData.isLoggedIn) {
      wx.redirectTo({ url: '/pages/login/login' });
      return false;
    }

    if (!hasAnyRole(app.globalData.userInfo, [USER_ROLE.COLLEGE, USER_ROLE.ADMIN])) {
      showToast('只有高教中心或管理员可以审核', 'none');
      wx.navigateBack();
      return false;
    }

    return true;
  },

  async loadData() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const userInfo = app.globalData.userInfo;

      const res = await getObservationList({
        userId: userInfo.id,
        userRole: userInfo.role,
        filter: 'pending',
        limit: 100,
        skip: 0
      });

      const list = res.list.map(item => ({
        ...item,
        observationDateFormatted: formatDate(item.observationDate),
        createTimeFormatted: formatDate(item.createTime)
      }));

      this.setData({
        list,
        loading: false
      });

    } catch (err) {
      console.error('加载待审核记录失败:', err);
      this.setData({ loading: false });
    }
  },

  async refreshData() {
    this.setData({ refreshing: true });
    await this.loadData();
    this.setData({ refreshing: false });
    wx.stopPullDownRefresh();
  },

  handleItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/observation/audit-detail/audit-detail?id=${id}`
    });
  }
});
