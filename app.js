// app.js
const privacy = require('./utils/privacy.js');

App({
  globalData: {
    // 云开发环境 ID。留空则使用默认环境；未开通云开发时全部走本地降级逻辑。
    env: '',
    cloudReady: false,
    // 订阅消息模板 ID（在公众平台「订阅消息」中申请后填入，用于给家人推送）
    tmplIds: []
  },

  onLaunch() {
    // 隐私授权：用到剪贴板 / 定位 / 选点 / 聊天文件前由页面里的 <privacy-popup> 接管
    privacy.install();
    this.initCloud();
  },

  initCloud() {
    if (!wx.cloud) {
      // 基础库 < 2.2.3 或游客模式，天气走直连 / 手动填写的降级路径
      this.globalData.cloudReady = false;
      return;
    }
    try {
      wx.cloud.init({
        env: this.globalData.env || undefined,
        traceUser: true
      });
      this.globalData.cloudReady = true;
    } catch (err) {
      this.globalData.cloudReady = false;
      console.warn('[app] 云开发初始化失败，将使用本地降级逻辑：', err && err.message);
    }
  }
});
