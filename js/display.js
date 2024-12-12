// 状态管理 ٩(◕‿◕｡)۶
let state = {
  currentPage: 1,
  pageSize: 24,  // 每页显示24个视频
  currentFolder: null,
  videos: [],
  searchText: '',
  sortBy: 'fav_time'
};

// 初始化页面 (◍•ᴗ•◍)
function initializePage() {
  initTheme();
  bindUploadEvents();
}

// 绑定文件上传事件 (｡>ㅿ<｡)
function bindUploadEvents() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('fileInput');

  // 处理拖放
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // 处理点击选择
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  });
}

// 处理文件 (灬ºωº灬)♡
async function handleFile(file) {
  if (file.type !== 'application/json') {
    showError('只能上传JSON文件');
    return;
  }

  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // 验证数据格式
    if (!data.favorites && !data.collections) {
      showError('这好像不是导出的收藏夹文件');
      return;
    }

    // 处理数据
    state.folders = [
      // 收藏夹
      ...(data.favorites || []).map(f => ({
        ...f,
        type: 'fav',  // 标记为收藏夹
        items: f.medias || []
      })),
      // 合集
      ...(data.collections || []).map(c => ({
        ...c,
        type: 'col',  // 标记为合集
        items: c.items || []
      }))
    ];

    // 隐藏上传区域，显示内容
    document.getElementById('uploadArea').style.display = 'none';
    document.querySelector('main').style.display = 'block';

    // 分别渲染收藏夹和合集列表
    renderFolderList('favList', state.folders.filter(item => item.type === 'fav'));
    renderFolderList('colList', state.folders.filter(item => item.type === 'col'));

    // 绑定其他事件
    bindEvents();

  } catch (error) {
    showError('读取文件失败');
    console.error(error);
  }
}

// 显示错误提示
function showError(message) {
  alert(message);
}

// 渲染收藏夹列表 (灬ºωº灬)♡
function renderFolderList(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = items.map(item => `
    <div class="folder-item" data-id="${item.id}" data-type="${item.type}">
      <span class="folder-title">${item.title}</span>
      <span class="folder-count">${item.media_count}个视频</span>
    </div>
  `).join('');
}

// 渲染视频列表 (｡>ω<｡)ﾉ♡
function renderVideoList() {
  const container = document.getElementById('videoContainer');
  
  // 过滤视频
  let filteredVideos = filterVideos(state.videos);
  // 排序视频（使用新的排序函数返回值）
  filteredVideos = sortVideos(filteredVideos);
  
  // 计算分页
  const start = (state.currentPage - 1) * state.pageSize;
  const end = Math.min(start + state.pageSize, filteredVideos.length);
  
  // 更新分页信息
  updatePagination(filteredVideos.length);
  
  // 渲染当前页的视频
  const pageVideos = filteredVideos.slice(start, end);
  container.innerHTML = pageVideos.map(createVideoCard).join('');
}

// 过滤视频 (〃'▽'〃)
function filterVideos(videos) {
  if (!state.searchText) return videos;
  
  return videos.filter(video => 
    video.title.toLowerCase().includes(state.searchText.toLowerCase()) ||
    video.upper.name.toLowerCase().includes(state.searchText.toLowerCase())
  );
}

// 排序视频
function sortVideos(videos) {
  // 使用 slice() 创建副本再排序，避免修改原数组
  return videos.slice().sort((a, b) => {
    switch (state.sortBy) {
      case 'fav_time':  // 按收藏时间排序
        // 确保是数字类型再比较
        const timeA = parseInt(a.fav_time);
        const timeB = parseInt(b.fav_time);
        if (isNaN(timeA) || isNaN(timeB)) {
          console.warn('Invalid timestamp found:', { a: a.fav_time, b: b.fav_time });
          return 0;
        }
        return timeB - timeA;  // 降序排列（新的在前）
        
      case 'time':      // 按发布时间排序
        const pubA = parseInt(a.pubtime);
        const pubB = parseInt(b.pubtime);
        if (isNaN(pubA) || isNaN(pubB)) {
          console.warn('Invalid pubtime found:', { a: a.pubtime, b: b.pubtime });
          return 0;
        }
        return pubB - pubA;    // 降序排列
        
      case 'title':     // 按标题排序
        return a.title.localeCompare(b.title, 'zh-CN');
        
      default:
        return timeB - timeA;
    }
  });
}

// 更新分页 (◕‿◕✿)
function updatePagination(total) {
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  
  // 更新总页数显示
  document.getElementById('totalPages').textContent = totalPages;
  
  // 更新页码输入框
  const pageInput = document.getElementById('pageInput');
  pageInput.value = state.currentPage;
  pageInput.max = totalPages;
  
  // 更新按钮状态
  document.getElementById('prevPage').disabled = state.currentPage === 1;
  document.getElementById('nextPage').disabled = state.currentPage === totalPages;
}

// 格式化数字 (｡>ㅿ<｡)
function formatNumber(num) {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toString();
}

// 格式化日期 (◍•ᴗ•◍)
function formatDate(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 绑定事件 ٩(◕‿◕｡)۶
function bindEvents() {
  // 收藏夹点击事件
  document.querySelectorAll('.folder-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      const type = item.dataset.type;
      state.currentFolder = { id, type };
      state.currentPage = 1;
      
      // 移除其他项目的active类
      document.querySelectorAll('.folder-item').forEach(i => i.classList.remove('active'));
      // 添加active类到当前项目
      item.classList.add('active');
      
      // 获取当前文件夹的视频列表
      const folder = state.folders.find(f => f.id.toString() === id && f.type === type);
      state.videos = folder.items || [];
      
      // 更新标题和列表
      document.getElementById('currentFolder').textContent = `${folder.title} (${folder.media_count}个视频)`;
      renderVideoList();
    });
  });

  // 搜索事件
  document.getElementById('searchVideo').addEventListener('input', (e) => {
    state.searchText = e.target.value;
    state.currentPage = 1;
    renderVideoList();
  });

  // 排序事件
  document.getElementById('sortVideos').addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    renderVideoList();
  });

  // 分页事件
  document.getElementById('prevPage').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      renderVideoList();
    }
  });

  document.getElementById('nextPage').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(state.videos.length / state.pageSize));
    if (state.currentPage < totalPages) {
      state.currentPage++;
      renderVideoList();
    }
  });

  // 页码输入事件
  const pageInput = document.getElementById('pageInput');
  
  // 输入时实时验证
  pageInput.addEventListener('input', () => {
    let value = parseInt(pageInput.value);
    const max = parseInt(pageInput.max);
    
    // 如果输入为空，不处理
    if (!pageInput.value) return;
    
    // 限制范围
    if (value < 1) value = 1;
    if (value > max) value = max;
    
    pageInput.value = value;
  });
  
  // 回车或失去焦点时跳转
  const jumpToPage = () => {
    const value = parseInt(pageInput.value);
    if (value && value !== state.currentPage) {
      state.currentPage = value;
      renderVideoList();
    }
  };
  
  pageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      jumpToPage();
      pageInput.blur(); // 失去焦点
    }
  });
  
  pageInput.addEventListener('blur', jumpToPage);

  // 创建并添加模态框到 body
  const modalTemplate = `
    <div class="video-detail-modal">
      <div class="modal-content">
        <button class="close-button">×</button>
        <div class="modal-body"></div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalTemplate);

  const modal = document.querySelector('.video-detail-modal');
  const modalBody = modal.querySelector('.modal-body');

  // 绑定详情按钮点击事件
  document.addEventListener('click', (e) => {
    if (e.target.closest('.info-button')) {
      const card = e.target.closest('.video-card');
      const bvid = card.dataset.bvid;
      // 通过 bvid 查找对应的视频
      const video = state.videos.find(v => v.bvid === bvid);
      
      // 更新模态框内容
      modalBody.innerHTML = `
        <h3>${video.title}</h3>
        <div class="detail-desc">${video.intro || '暂无简介'}</div>
        <div class="detail-meta">
          <span>UP主：${video.upper?.name || '未知UP主'}</span>
          <span>发布时间：${formatDate(video.pubtime)}</span>
          <span>收藏时间：${formatDate(video.fav_time)}</span>
          <div class="stats-grid">
            <span>播放：${formatNumber(video.cnt_info?.play || 0)}</span>
            <span>弹幕：${formatNumber(video.cnt_info?.danmaku || 0)}</span>
            <span>收藏：${formatNumber(video.cnt_info?.collect || 0)}</span>
          </div>
        </div>
      `;
      
      modal.classList.add('active');
      e.stopPropagation();
    }
    
    if (e.target.closest('.close-button') || 
        (e.target.classList.contains('video-detail-modal') && e.target.classList.contains('active'))) {
      modal.classList.remove('active');
    }
  });
}

// 初始化页面 (灬ºωº灬)♡
document.addEventListener('DOMContentLoaded', initializePage);

// 处理B站图片403的问题 (灬ºωº灬)♡
function processImageUrl(url) {
  if (!url) return '';
  
  // 如果是B站图片，替换域名并移除协议
  return url.replace(/^https?:\/\/(i[0-9]\.hdslb\.com)/, 'https://images.weserv.nl/?url=$1');
}

// 修改视频卡片渲染函数
function createVideoCard(video) {
  // 添加默认图片，以防封面加载失败
  const defaultCover = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 100"><rect width="160" height="100" fill="%23eee"/><text x="50%" y="50%" fill="%23aaa" text-anchor="middle" dominant-baseline="middle">暂无封面</text></svg>';

  // 格式化时间
  const pubDate = formatDate(video.pubtime);
  const favDate = formatDate(video.fav_time);

  return `
    <div class="video-card" data-bvid="${video.bvid}">
      <div class="video-cover">
        <img 
          src="${processImageUrl(video.cover)}" 
          alt="${video.title}" 
          onerror="this.src='${defaultCover}'"
          loading="lazy"
        >
        <button class="info-button" title="查看详情">i</button>
      </div>
      <div class="video-info">
        <div class="video-title">
          <a href="https://www.bilibili.com/video/${video.bvid}" target="_blank" rel="noopener">
            ${video.title}
          </a>
        </div>
        <div class="video-meta">
          <a href="https://space.bilibili.com/${video.upper?.mid}" class="up-name" target="_blank" rel="noopener">
            ${video.upper?.name || '未知UP主'}
          </a>
          <span class="upload-time">${pubDate}</span>
        </div>
        <div class="video-stats">
          <span>播放 ${formatNumber(video.cnt_info?.play || 0)}</span>
          <span>弹幕 ${formatNumber(video.cnt_info?.danmaku || 0)}</span>
        </div>
      </div>
    </div>
  `;
}

// 主题切换功能
function initTheme() {
  const themeToggle = document.getElementById('toggleTheme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  
  // 设置主题
  function setTheme(isDark) {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }
  
  // 初始化主题
  setTheme(prefersDark.matches);
  
  // 监听系统主题变化
  prefersDark.addEventListener('change', (e) => {
    setTheme(e.matches);
  });
  
  // 点击切换主题
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    setTheme(!isDark);
  });
} 