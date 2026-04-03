/**
 * 用户卡片组件
 * 用于展示用户基本信息
 */

import { getRoleText } from '../../utils/constants.js';

Component({
  /**
   * 组件属性
   */
  properties: {
    // 用户信息
    user: {
      type: Object,
      value: null
    },
    // 是否显示详情
    showDetail: {
      type: Boolean,
      value: false
    },
    // 卡片大小
    size: {
      type: String,
      value: 'medium' // small/medium/large
    }
  },

  /**
   * 组件数据
   */
  data: {
    roleText: ''
  },

  /**
   * 生命周期
   */
  lifetimes: {
    attached() {
      this.updateRoleText();
    }
  },

  /**
   * 属性监听器
   */
  observers: {
    'user': function() {
      this.updateRoleText();
    }
  },

  /**
   * 组件方法
   */
  methods: {
    /**
     * 更新角色文本
     */
    updateRoleText() {
      const { user } = this.properties;
      if (!user) {
        this.setData({ roleText: '' });
        return;
      }

      const roleText = getRoleText(user);
      this.setData({ roleText });
    },

    /**
     * 点击卡片
     */
    handleTap() {
      this.triggerEvent('tap', { user: this.properties.user });
    }
  }
});
