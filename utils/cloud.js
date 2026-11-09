// utils/cloud.js —— 云函数调用统一封装（失败不抛出到页面层，由调用方降级）

function call(name, data) {
  return new Promise(function (resolve, reject) {
    if (!wx.cloud) {
      reject(new Error('CLOUD_UNSUPPORTED'));
      return;
    }
    const timer = setTimeout(function () {
      reject(new Error('CLOUD_TIMEOUT'));
    }, 8000);

    wx.cloud.callFunction({
      name: name,
      data: data || {},
      success: function (res) {
        clearTimeout(timer);
        resolve(res && res.result);
      },
      fail: function (err) {
        clearTimeout(timer);
        reject(err || new Error('CLOUD_FAIL'));
      }
    });
  });
}

module.exports = { call: call };
