/**
 * 状态标签组件
 * 用于显示各种状态，支持自定义颜色
 */

import { OBSERVATION_STATUS_TEXT, OBSERVATION_STATUS } from '../../utils/constants.js';

Component({
  /**
   * 组件属性
   */
  properties: {
    // 状态值
    status: {
      type: String,
      value: ''
    },
    // 自定义文本（不传则使用默认映射）
    text: {
      type: String,
      value: ''
    },
    // 自定义颜色
    color: {
      type: String,
      value: ''
    },
    // 标签类型（用于预定义颜色）
    type: {
      type: String,
      value: '' // pending/success/warning/danger/info
    },
    // 标签大小
    size: {
      type: String,
      value: 'medium' // small/medium/large
    },
    // 是否为空心样式
    outline: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件数据
   */
  data: {
    displayText: '',
    displayColor: ''
  },

  /**
   * 生命周期
   */
  lifetimes: {
    attached() {
      this.updateDisplay();
    }
  },

  /**
   * 属性监听器
   */
  observers: {
    'status, text, color, type': function() {
      this.updateDisplay();
    }
  },

  /**
   * 组件方法
   */
  methods: {
    /**
     * 更新显示内容
     */
    updateDisplay() {
      const { status, text, color, type } = this.properties;

      // 确定显示文本
      let displayText = text;
      if (!displayText && status) {
        // 听课记录状态映射
        displayText = OBSERVATION_STATUS_TEXT[status] || status;
      }

      // 确定显示颜色
      let displayColor = color;
      if (!displayColor) {
        // 根据类型获取预定义颜色
        displayColor = this.getTypeColor(type);
      }
      if (!displayColor && status) {
        // 根据状态获取颜色
        displayColor = this.getStatusColor(status);
      }

      this.setData({
        displayText,
        displayColor
      });
    },

    /**
     * 获取类型对应的颜色
     */
    getTypeColor(type) {
      const colorMap = {
        pending: '#faad14',
        success: '#52c41a',
        warning: '#faad14',
        danger: '#ff4d4f',
        info: '#1890ff'
      };
      return colorMap[type] || '';
    },

    /**
     * 获取状态对应的颜色
     */
    getStatusColor(status) {
      // 听课记录状态颜色
      const observationColorMap = {
        [OBSERVATION_STATUS.PENDING]: '#faad14',
        [OBSERVATION_STATUS.APPROVED]: '#52c41a',
        [OBSERVATION_STATUS.REJECTED]: '#ff4d4f'
      };

      return observationColorMap[status] || '';
    }
  }
});
