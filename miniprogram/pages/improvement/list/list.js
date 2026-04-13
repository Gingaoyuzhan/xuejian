// pages/improvement/list/list.js
/**
 * 持续改进任务列表页
 */

import { getImprovementList } from '../../../utils/request.js';
import { formatDate } from '../../../utils/util.js';
import { IMPROVEMENT_STAGE, USER_ROLE, hasRole, hasAnyRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  /**
   * 页面数据
   */
  data: {
    list: [],
    userInfo: null,
    total: 0,
    limit: 20,
    skip: 0,
    hasMore: true,
    loading: false,
    refreshing: false,
    isLoggedIn: false,
    filter: 'all',
    filterIndex: 0,
    filterOptions: [],
    canCreate: false
  },

  /**
   * 生命周期
   */
  onLoad(options) {
    if (options.filter) {
      this.setData({ filter: options.filter });
    }
  },

  onShow() {
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ isLoggedIn });
    if (isLoggedIn) {
      const userInfo = app.globalData.userInfo;
      this.setData({
        userInfo,
        canCreate: true
      });
      this.initFilterOptions();
      this.loadData();
    }
  },

  onPullDownRefresh() {
    if (!this.data.isLoggedIn) { wx.stopPullDownRefresh(); return; }
    this.refreshData();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  /**
   * 初始化筛选选项
   */
  initFilterOptions() {
    const userInfo = app.globalData.userInfo || {};
    const filterOptions = [];
    const pushOption = (value, label) => {
      if (!filterOptions.some(item => item.value === value)) {
        filterOptions.push({ value, label });
      }
    };

    if (hasAnyRole(userInfo, [USER_ROLE.SUPERVISOR, USER_ROLE.COLLEGE, USER_ROLE.ADMIN])) {
      pushOption('all', '全部事项');
    }
    pushOption('created', '我发起的');
    if (hasRole(userInfo, USER_ROLE.SUPERVISOR)) {
      pushOption('supervisor_review', '待我复核');
    }
    if (hasRole(userInfo, USER_ROLE.COLLEGE)) {
      pushOption('college_check', '待我复查');
    }
    if (hasRole(userInfo, USER_ROLE.DEPARTMENT_LEADER)) {
      pushOption('department', '本院事项');
      pushOption('pending', '待我处理');
    }
    if (hasRole(userInfo, USER_ROLE.TEACHER)) {
      pushOption('todos', '我的整改');
    }
    if (hasAnyRole(userInfo, [USER_ROLE.SUPERVISOR, USER_ROLE.COLLEGE, USER_ROLE.ADMIN, USER_ROLE.DEPARTMENT_LEADER])) {
      pushOption('completed', '已闭环');
    }

    if (filterOptions.length === 0) {
      pushOption('all', '全部事项');
    }

    let { filter } = this.data;
    let filterIndex = filterOptions.findIndex(item => item.value === filter);
    if (filterIndex < 0) {
      filterIndex = 0;
      filter = filterOptions[0].value;
    }

    this.setData({
      filterOptions,
      filter,
      filterIndex
    });
  },

  /**
   * 加载数据
   */
  async loadData() {
    if (this.data.loading) return;

    this.setData({ loading: true });

    try {
      const { filter, limit, skip } = this.data;
      const userInfo = app.globalData.userInfo;

      const res = await getImprovementList({
        userId: userInfo.id,
        userRole: userInfo.role,
        filter,
        limit,
        skip
      });

      const list = res.list.map(item => ({
        ...item,
        createTimeFormatted: formatDate(item.createTime),
        stageText: this.getStageText(item.currentStage)
      }));

      this.setData({
        list: skip === 0 ? list : [...this.data.list, ...list],
        total: res.total,
        hasMore: (skip + limit) < res.total,
        loading: false
      });

    } catch (err) {
      console.error('加载改进任务失败:', err);
      this.setData({ loading: false });
    }
  },

  /**
   * 刷新数据
   */
  async refreshData() {
    this.setData({
      skip: 0,
      hasMore: true,
      refreshing: true
    });

    await this.loadData();

    this.setData({ refreshing: false });
    wx.stopPullDownRefresh();
  },

  /**
   * 加载更多
   */
  loadMore() {
    this.setData({
      skip: this.data.list.length
    });
    this.loadData();
  },

  /**
   * 获取阶段文本
   */
  getStageText(stage) {
    const map = {
      [IMPROVEMENT_STAGE.SUBMITTED]: '一级发起',
      [IMPROVEMENT_STAGE.REVISING]: '二级处理',
      [IMPROVEMENT_STAGE.COLLEGE_CHECK]: '高教中心复查',
      [IMPROVEMENT_STAGE.SUPERVISOR_REVIEW]: '学校督导复核',
      [IMPROVEMENT_STAGE.COMPLETED]: '闭环完成'
    };
    return map[stage] || stage;
  },

  /**
   * 切换筛选条件
   */
  handleFilterChange(e) {
    const index = Number(e.detail.value);
    const option = this.data.filterOptions[index];
    if (!option) return;

    const value = option.value;
    this.setData({
      filter: value,
      filterIndex: index,
      skip: 0,
      list: [],
      hasMore: true
    });
    this.loadData();
  },

  /**
   * 跳转到创建页
   */
  handleCreate() {
    if (!this.data.canCreate) return;

    wx.navigateTo({
      url: '/pages/improvement/create/create'
    });
  },

  /**
   * 点击任务项
   */
  handleItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/improvement/detail/detail?id=${id}`
    });
  }
});
