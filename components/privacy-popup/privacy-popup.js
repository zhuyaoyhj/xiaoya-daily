// components/privacy-popup/privacy-popup.js
// 微信隐私保护指引弹窗：用到剪贴板 / 定位 / 选点前，微信会通过 app.js 的 onNeedPrivacyAuthorization 通知，
// 这里负责把弹窗显示出来，用户同意后再把结果交还给微信，原来的接口调用会自动继续。
const privacy = require('../../utils/privacy.js');

Component({
  data: {
    show: false,
    contractName: '《小芽日常隐私保护指引》'
  },

  lifetimes: {
    attached() {
      const that = this;
      this._off = privacy.subscribe(function (state) {
        that.setData({ show: !!state.show, contractName: state.contractName || that.data.contractName });
      });
    },
    detached() {
      if (this._off) this._off();
    }
  },

  methods: {
    openContract() {
      if (wx.openPrivacyContract) wx.openPrivacyContract({});
    },

    /** button open-type="agreePrivacyAuthorization" 的回调：微信已记下同意，这里只需放行 */
    onAgree() {
      privacy.resolve('agree');
    },

    onDisagree() {
      privacy.resolve('disagree');
    },

    noop() {}
  }
});
