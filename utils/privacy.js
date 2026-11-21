// utils/privacy.js —— 隐私授权的中转站
// 微信在页面调用隐私接口前触发 wx.onNeedPrivacyAuthorization(resolve)；
// 这里把 resolve 存下来并通知当前页面里的 <privacy-popup> 显示，用户点完再调 resolve。
// 页面不用写任何代码，只要挂上组件。

let pending = null; // 微信给的 resolve
let exposed = false; // 这次请求有没有已经告诉微信「弹窗露出了」
let state = { show: false, contractName: '' };
const listeners = [];

/**
 * 按微信要求：自定义弹窗真正显示出来时，先回 { event: 'exposureAuthorization' }，
 * 之后用户点同意 / 拒绝再回一次。没显示就不能报露出。
 */
function reportExposure() {
  if (!pending || exposed || !state.show || !listeners.length) return;
  exposed = true;
  try {
    pending({ event: 'exposureAuthorization' });
  } catch (e) {
    // 忽略
  }
}

function emit() {
  listeners.slice().forEach(function (fn) {
    try {
      fn(state);
    } catch (e) {
      // 单个组件出错不影响其他
    }
  });
}

function subscribe(fn) {
  listeners.push(fn);
  fn(state);
  // 请求来的时候页面上还没有弹窗（比如组件晚一步挂上），挂上这一刻再露出
  reportExposure();
  return function () {
    const i = listeners.indexOf(fn);
    if (i > -1) listeners.splice(i, 1);
  };
}

/** app.js onLaunch 里调用一次 */
function install() {
  if (typeof wx === 'undefined' || typeof wx.onNeedPrivacyAuthorization !== 'function') return false;
  wx.onNeedPrivacyAuthorization(function (resolve) {
    pending = resolve;
    exposed = false;
    state = Object.assign({}, state, { show: true });
    // 当前页面还没有弹窗组件时先挂起：不能谎报「已露出」。
    // 所有页面都挂了 <privacy-popup />，组件 attached 时 subscribe 会补上露出。
    emit();
    reportExposure();
  });
  if (typeof wx.getPrivacySetting === 'function') {
    wx.getPrivacySetting({
      success: function (res) {
        if (res && res.privacyContractName) {
          state = Object.assign({}, state, { contractName: res.privacyContractName });
          emit();
        }
      }
    });
  }
  return true;
}

/** @param {'agree'|'disagree'} result */
function resolve(result) {
  const fn = pending;
  pending = null;
  exposed = false;
  state = Object.assign({}, state, { show: false });
  emit();
  if (!fn) return;
  if (result === 'agree') fn({ buttonId: 'privacy-agree', event: 'agree' });
  else fn({ event: 'disagree' });
}

function isShowing() {
  return !!state.show;
}

module.exports = {
  install: install,
  subscribe: subscribe,
  resolve: resolve,
  isShowing: isShowing
};
