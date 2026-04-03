/**
 * 图片上传组件
 * 支持多图上传、预览、删除
 */

import { showToast } from '../../utils/util.js';
import { uploadImage } from '../../utils/request.js';

Component({
  /**
   * 组件属性
   */
  properties: {
    // 图片列表（URL数组）
    value: {
      type: Array,
      value: []
    },
    // 最大上传数量
    maxCount: {
      type: Number,
      value: 9
    },
    // 最大文件大小（字节）
    maxSize: {
      type: Number,
      value: 10 * 1024 * 1024 // 10MB
    },
    // 是否禁用
    disabled: {
      type: Boolean,
      value: false
    },
    // 云存储路径前缀
    cloudPathPrefix: {
      type: String,
      value: 'images'
    }
  },

  /**
   * 组件数据
   */
  data: {
    imageList: []
  },

  /**
   * 生命周期
   */
  lifetimes: {
    attached() {
      this.setData({
        imageList: this.properties.value || []
      });
    }
  },

  /**
   * 属性监听器
   */
  observers: {
    'value': function(newVal) {
      this.setData({
        imageList: newVal || []
      });
    }
  },

  /**
   * 组件方法
   */
  methods: {
    /**
     * 选择图片
     */
    chooseImage() {
      const { imageList, maxCount, maxSize } = this.data;
      const remainCount = maxCount - imageList.length;

      if (remainCount <= 0) {
        showToast(`最多上传${maxCount}张图片`, 'none');
        return;
      }

      wx.chooseMedia({
        count: remainCount,
        mediaType: ['image'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const files = res.tempFiles;
          this.uploadFiles(files);
        }
      });
    },

    /**
     * 上传文件
     */
    async uploadFiles(files) {
      // 先过滤掉超过大小限制的文件
      const validFiles = [];
      const oversizedCount = files.filter(file => file.size > this.data.maxSize).length;

      if (oversizedCount > 0) {
        showToast(`${oversizedCount}张图片超过大小限制已跳过`, 'none');
      }

      for (const file of files) {
        if (file.size <= this.data.maxSize) {
          validFiles.push(file);
        }
      }

      if (validFiles.length === 0) {
        showToast('没有可上传的图片', 'none');
        return;
      }

      wx.showLoading({
        title: '上传中...',
        mask: true
      });

      const uploadPromises = validFiles.map(file => {
        return uploadImage(file.tempFilePath, {
          loading: false,
          showError: false
        });
      });

      try {
        const results = await Promise.allSettled(uploadPromises);
        const validUrls = results
          .filter(item => item.status === 'fulfilled' && item.value)
          .map(item => item.value);
        const failedCount = results.length - validUrls.length;

        if (validUrls.length === 0) {
          wx.hideLoading();
          showToast('上传失败，请重试', 'none');
          return;
        }

        const newImageList = [...this.data.imageList, ...validUrls];
        this.setData({
          imageList: newImageList
        });

        // 触发更新事件
        this.triggerEvent('change', { value: newImageList });
        this.triggerEvent('input', newImageList);

        wx.hideLoading();
        if (failedCount > 0) {
          showToast(`成功${validUrls.length}张，失败${failedCount}张`, 'none');
        } else {
          showToast(`成功上传${validUrls.length}张图片`, 'success');
        }
      } catch (err) {
        wx.hideLoading();
        console.error('上传失败:', err);
        showToast('上传失败，请重试', 'none');
      }
    },

    /**
     * 预览图片
     */
    previewImage(e) {
      const { index } = e.currentTarget.dataset;
      const { imageList } = this.data;

      wx.previewImage({
        urls: imageList,
        current: imageList[index]
      });
    },

    /**
     * 删除图片
     */
    deleteImage(e) {
      const { index } = e.currentTarget.dataset;
      const { imageList } = this.data;

      imageList.splice(index, 1);

      this.setData({
        imageList: [...imageList]
      });

      // 触发更新事件
      this.triggerEvent('change', { value: imageList });
      this.triggerEvent('input', imageList);
    },
  }
});
