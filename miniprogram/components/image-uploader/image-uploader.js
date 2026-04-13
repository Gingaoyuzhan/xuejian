/**
 * 图片上传组件
 * 支持多图上传、预览、删除
 */

import { showToast } from '../../utils/util.js';
import { uploadImage } from '../../utils/request.js';

const ONLINE_UPLOAD_SAFE_SIZE = 900 * 1024;
const COMPRESS_QUALITY_STEPS = [80, 60, 40, 25];

function chooseCompressedImages(count) {
  return new Promise((resolve, reject) => {
    wx.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFiles = Array.isArray(res.tempFiles)
          ? res.tempFiles
          : (res.tempFilePaths || []).map(filePath => ({ tempFilePath: filePath, size: 0 }));
        resolve(tempFiles);
      },
      fail: reject
    });
  });
}

function getLocalFileInfo(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileInfo({
      filePath,
      success: resolve,
      fail: reject
    });
  });
}

function compressLocalImage(filePath, quality) {
  return new Promise((resolve, reject) => {
    wx.compressImage({
      src: filePath,
      quality,
      success: resolve,
      fail: reject
    });
  });
}

function getUploadErrorMessage(error) {
  const message = String(error?.message || error || '').trim();
  return message || '上传失败，请重试';
}

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
      const { imageList, maxCount } = this.data;
      const remainCount = maxCount - imageList.length;

      if (remainCount <= 0) {
        showToast(`最多上传${maxCount}张图片`, 'none');
        return;
      }

      chooseCompressedImages(remainCount)
        .then(files => this.uploadFiles(files))
        .catch((err) => {
          if (!String(err?.errMsg || '').includes('cancel')) {
            showToast('选择图片失败，请重试', 'none');
          }
        });
    },

    async normalizeFile(file) {
      const tempFilePath = file.tempFilePath || file.path || '';
      if (!tempFilePath) {
        return null;
      }

      let size = Number(file.size) || 0;
      if (!size) {
        try {
          const fileInfo = await getLocalFileInfo(tempFilePath);
          size = Number(fileInfo.size) || 0;
        } catch (err) {
          size = 0;
        }
      }

      return {
        tempFilePath,
        size,
        originalSize: size,
        compressed: false
      };
    },

    async ensureUploadableFile(file) {
      const normalizedFile = await this.normalizeFile(file);
      if (!normalizedFile) {
        return { ok: false, reason: 'invalid' };
      }

      const maxAllowedSize = this.data.maxSize;
      if (normalizedFile.size > maxAllowedSize) {
        return { ok: false, reason: 'too_large' };
      }

      if (normalizedFile.size > 0 && normalizedFile.size <= ONLINE_UPLOAD_SAFE_SIZE) {
        return { ok: true, file: normalizedFile };
      }

      let currentPath = normalizedFile.tempFilePath;
      let currentSize = normalizedFile.size;

      for (const quality of COMPRESS_QUALITY_STEPS) {
        try {
          const compressedRes = await compressLocalImage(currentPath, quality);
          const compressedPath = compressedRes.tempFilePath || currentPath;
          const fileInfo = await getLocalFileInfo(compressedPath);
          currentPath = compressedPath;
          currentSize = Number(fileInfo.size) || 0;

          if (currentSize > 0 && currentSize <= ONLINE_UPLOAD_SAFE_SIZE) {
            return {
              ok: true,
              file: {
                tempFilePath: currentPath,
                size: currentSize,
                originalSize: normalizedFile.originalSize,
                compressed: true
              }
            };
          }
        } catch (err) {
          continue;
        }
      }

      return {
        ok: false,
        reason: 'gateway_limit',
        size: currentSize || normalizedFile.size || 0
      };
    },

    /**
     * 上传文件
     */
    async uploadFiles(files) {
      const preparedFiles = [];
      let oversizedCount = 0;
      let gatewayLimitedCount = 0;
      let compressedCount = 0;

      wx.showLoading({
        title: '处理中...',
        mask: true
      });

      for (const file of files) {
        const prepared = await this.ensureUploadableFile(file);
        if (!prepared.ok) {
          if (prepared.reason === 'too_large') {
            oversizedCount += 1;
          } else if (prepared.reason === 'gateway_limit') {
            gatewayLimitedCount += 1;
          }
          continue;
        }

        preparedFiles.push(prepared.file);
        if (prepared.file.compressed) {
          compressedCount += 1;
        }
      }

      if (preparedFiles.length === 0) {
        wx.hideLoading();
        if (oversizedCount > 0 || gatewayLimitedCount > 0) {
          const blockedCount = oversizedCount + gatewayLimitedCount;
          showToast(`${blockedCount}张图片过大，已跳过`, 'none');
          return;
        }
        showToast('没有可上传的图片', 'none');
        return;
      }

      if (oversizedCount > 0) {
        showToast(`${oversizedCount}张图片超过大小限制已跳过`, 'none');
      }

      if (gatewayLimitedCount > 0) {
        showToast(`${gatewayLimitedCount}张图片压缩后仍过大，已跳过`, 'none');
      }

      wx.showLoading({
        title: '上传中...',
        mask: true
      });

      const uploadPromises = preparedFiles.map(file => {
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
        const firstFailure = results.find(item => item.status === 'rejected');
        const failureMessage = firstFailure ? getUploadErrorMessage(firstFailure.reason) : '上传失败，请重试';

        if (validUrls.length === 0) {
          wx.hideLoading();
          showToast(failureMessage, 'none');
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

        const successCount = validUrls.length;
        if (failedCount > 0) {
          showToast(`成功${successCount}张，失败${failedCount}张`, 'none');
          return;
        }

        if (compressedCount > 0) {
          showToast(`成功上传${successCount}张，已压缩${compressedCount}张`, 'success');
          return;
        }

        showToast(`成功上传${successCount}张图片`, 'success');
      } catch (err) {
        wx.hideLoading();
        console.error('上传失败:', err);
        showToast(getUploadErrorMessage(err), 'none');
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
