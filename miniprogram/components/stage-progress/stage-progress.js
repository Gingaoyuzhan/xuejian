/**
 * 阶段进度组件
 * 用于展示持续改进工作流的各阶段状态
 */

import { IMPROVEMENT_STAGE, IMPROVEMENT_STAGE_TEXT, IMPROVEMENT_STAGE_COLOR } from '../../utils/constants.js';

Component({
  /**
   * 组件属性
   */
  properties: {
    // 当前阶段
    currentStage: {
      type: String,
      value: ''
    },
    // 是否垂直布局
    vertical: {
      type: Boolean,
      value: false
    }
  },

  /**
   * 组件数据
   */
  data: {
    stages: [
      {
        key: IMPROVEMENT_STAGE.SUBMITTED,
        name: IMPROVEMENT_STAGE_TEXT[IMPROVEMENT_STAGE.SUBMITTED],
        color: IMPROVEMENT_STAGE_COLOR[IMPROVEMENT_STAGE.SUBMITTED]
      },
      {
        key: IMPROVEMENT_STAGE.REVISING,
        name: IMPROVEMENT_STAGE_TEXT[IMPROVEMENT_STAGE.REVISING],
        color: IMPROVEMENT_STAGE_COLOR[IMPROVEMENT_STAGE.REVISING]
      },
      {
        key: IMPROVEMENT_STAGE.COLLEGE_CHECK,
        name: IMPROVEMENT_STAGE_TEXT[IMPROVEMENT_STAGE.COLLEGE_CHECK],
        color: IMPROVEMENT_STAGE_COLOR[IMPROVEMENT_STAGE.COLLEGE_CHECK]
      },
      {
        key: IMPROVEMENT_STAGE.SUPERVISOR_REVIEW,
        name: IMPROVEMENT_STAGE_TEXT[IMPROVEMENT_STAGE.SUPERVISOR_REVIEW],
        color: IMPROVEMENT_STAGE_COLOR[IMPROVEMENT_STAGE.SUPERVISOR_REVIEW]
      },
      {
        key: IMPROVEMENT_STAGE.COMPLETED,
        name: IMPROVEMENT_STAGE_TEXT[IMPROVEMENT_STAGE.COMPLETED],
        color: IMPROVEMENT_STAGE_COLOR[IMPROVEMENT_STAGE.COMPLETED]
      }
    ],
    stageOrder: [
      IMPROVEMENT_STAGE.SUBMITTED,
      IMPROVEMENT_STAGE.REVISING,
      IMPROVEMENT_STAGE.COLLEGE_CHECK,
      IMPROVEMENT_STAGE.SUPERVISOR_REVIEW,
      IMPROVEMENT_STAGE.COMPLETED
    ],
    renderedStages: []
  },

  lifetimes: {
    attached() {
      this.updateRenderedStages(this.properties.currentStage);
    }
  },

  observers: {
    currentStage(newStage) {
      this.updateRenderedStages(newStage);
    }
  },

  /**
   * 组件方法
   */
  methods: {
    updateRenderedStages(currentStage) {
      const currentIndex = this.data.stageOrder.indexOf(currentStage);
      const renderedStages = this.data.stages.map(stage => {
        const index = this.data.stageOrder.indexOf(stage.key);
        let status = 'pending';

        if (index < currentIndex) {
          status = 'completed';
        } else if (index === currentIndex) {
          status = 'active';
        }

        return {
          ...stage,
          status,
          itemClass: `stage-item stage-item--${status}`,
          lineClass: `stage-line stage-line--${status}`,
          icon: this.getStageIcon(status)
        };
      });

      this.setData({ renderedStages });
    },

    /**
     * 获取阶段图标
     * @param {string} status - 阶段状态
     * @returns {string} 图标
     */
    getStageIcon(status) {
      const iconMap = {
        completed: '✓',
        active: '●',
        pending: '○'
      };
      return iconMap[status] || '○';
    }
  }
});
