chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'fetchBiliplus') {
    const maxRetries = 3;
    let retryCount = 0;

    const fetchWithRetry = async () => {
      try {
        const response = await fetch(request.url);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.text();
        sendResponse(data);
      } catch (error) {
        retryCount++;
        if (retryCount < maxRetries) {
          // 等待时间随重试次数增加：1秒、2秒、3秒
          await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
          return fetchWithRetry();
        }
        sendResponse({ error: error.message });
      }
    };

    fetchWithRetry();
    return true; // 保持消息通道打开
  }
});