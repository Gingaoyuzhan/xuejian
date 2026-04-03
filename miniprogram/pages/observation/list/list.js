// pages/observation/list/list.js
/**
 * 听课记录列表页
 */

import { getObservationList } from '../../../utils/request.js';
import { formatDate } from '../../../utils/util.js';
import { USER_ROLE, hasRole, hasAnyRole } from '../../../utils/constants.js';

const app = getApp();

Page({
  /**
   * 页面数据
   */
  data: {
    // 列表数据
    list: [],
    userInfo: null,
    // 分页信息
    total: 0,
    limit: 20,
    skip: 0,
    hasMore: true,
    // 筛选条件
    filter: 'all',
    filterIndex: 0,
    filterOptions: [
      { value: 'all', label: '全部' },
      { value: 'my', label: '我创建的' },
      { value: 'about', label: '关于我的' },
      { value: 'pending', label: '待审核' }
    ],
    // 加载状态
    loading: false,
    refreshing: false,
    // 登录状态
    isLoggedIn: false,
    canCreate: false
  },

  /**
   * 生命周期
   */
  onLoad(options) {
    // 从参数获取筛选条件
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
        canCreate: hasRole(userInfo, USER_ROLE.SUPERVISOR)
      });
      this.initFilterOptions();
      this.loadData();
    }
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    if (!this.data.isLoggedIn) { wx.stopPullDownRefresh(); return; }
    this.refreshData();
  },

  /**
   * 上拉加载更多
   */
  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMore();
    }
  },

  /**
   * 跳转登录页
   */
  goToLogin() {
    wx.navigateTo({
      url: '/pages/login/login'
    });
  },

  /**
   * 初始化筛选选项（根据角色）
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
      pushOption('all', '全部记录');
    }
    if (hasRole(userInfo, USER_ROLE.SUPERVISOR)) {
      pushOption('my', '我填写的');
    }
    if (hasRole(userInfo, USER_ROLE.TEACHER)) {
      pushOption('about', '关于我的');
    }
    if (hasAnyRole(userInfo, [USER_ROLE.COLLEGE, USER_ROLE.ADMIN])) {
      pushOption('pending', '待审核');
      pushOption('audit', '已审核');
    }

    if (filterOptions.length === 0) {
      pushOption('about', '关于我的');
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

      const res = await getObservationList({
        userId: userInfo.id,
        userRole: userInfo.role,
        filter,
        limit,
        skip
      });

      const list = res.list.map(item => ({
        ...item,
        observationDateFormatted: formatDate(item.observationDate),
        createTimeFormatted: formatDate(item.createTime)
      }));

      this.setData({
        list: skip === 0 ? list : [...this.data.list, ...list],
        total: res.total,
        hasMore: (skip + limit) < res.total,
        loading: false
      });

    } catch (err) {
      console.error('加载听课记录失败:', err);
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
   * 点击记录项
   */
  handleItemTap(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/observation/detail/detail?id=${id}`
    });
  },

  /**
   * 创建听课记录
   */
  handleCreate() {
    if (!this.data.canCreate) return;
    wx.navigateTo({
      url: '/pages/observation/create/create'
    });
  }
});
