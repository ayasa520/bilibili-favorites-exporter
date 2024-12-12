document.getElementById('displayBtn').addEventListener('click', () => {
  chrome.tabs.create({
    url: chrome.runtime.getURL('display.html')
  });
}); 