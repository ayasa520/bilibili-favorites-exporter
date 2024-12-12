// 请求管理器
const RequestManager = {
  queue: [],
  isProcessing: false,
  baseDelay: 500, // 基础延时500ms
  currentDelay: 500,
  maxDelay: 30000, // 最大延时30秒
  minDelay: 500,   // 最小延时500ms
  consecutiveErrors: 0,
  consecutiveSuccess: 0,
  
  // 调整延时
  adjustDelay(isSuccess) {
    if (!isSuccess) {
      this.consecutiveSuccess = 0;
      this.consecutiveErrors++;
      // 出错时指数增加延时
      this.currentDelay = Math.min(
        this.currentDelay * Math.pow(1.5, this.consecutiveErrors),
        this.maxDelay
      );
    } else {
      this.consecutiveErrors = 0;
      this.consecutiveSuccess++;
      // 连续成功5次后尝试减少延时
      if (this.consecutiveSuccess >= 5) {
        this.currentDelay = Math.max(
          this.currentDelay * 0.8,
          this.minDelay
        );
        this.consecutiveSuccess = 0;
      }
    }
  },

  // 添加请求到队列
  async addRequest(url, sendResponse) {
    this.queue.push({ url, sendResponse });
    if (!this.isProcessing) {
      this.processQueue();
    }
  },

  // 处理单个请求，包含重试逻辑
  async processRequest(url, sendResponse, retryCount = 0) {
    const maxRetries = 5;

    try {
      // 请求前等待当前延时
      await new Promise(resolve => setTimeout(resolve, this.currentDelay));
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.text();
      this.adjustDelay(true);
      sendResponse(data);
      return true;
    } catch (error) {
      this.adjustDelay(false);
      
      if (retryCount < maxRetries) {
        console.log(`Retry ${retryCount + 1}, current delay: ${this.currentDelay}ms`);
        return this.processRequest(url, sendResponse, retryCount + 1);
      }
      
      sendResponse({ error: error.message });
      return false;
    }
  },

  // 处理队列
  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const { url, sendResponse } = this.queue.shift();
    
    await this.processRequest(url, sendResponse);
    this.processQueue();
  }
};

// 修改消息监听器
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetchBiliplus') {
    RequestManager.addRequest(request.url, sendResponse);
    return true;
  }
  if (request.type === 'openExportPage') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('export.html'),
      active: true
    }, (tab) => {
      // 存储导出信息，供新页面使用
      chrome.storage.local.set({
        exportData: {
          items: request.items,
          uid: request.uid,
          settings: request.settings
        }
      });
    });
  }
});