class BilibiliExporter {
    constructor() {
        this.dialogEl = null;
        this.uid = this.getUIDFromURL();
        // 状态管理
        this.state = {
            favorites: [], // 自建收藏夹
            collections: [], // 订阅合集
            searchText: '',
            sortBy: 'default',
            loading: false,  // 改为false，避免阻塞首次加载
            initialized: false
        };

        this.exportState = {
            exporting: false,
            currentProgress: new Map(), // 存储每个项目的导出进度
            aborted: false  // 添加终止状态
        };

        // 移除构造函数中的自动加载
        // 让用户点击时再加载
    }

    getUIDFromURL() {
        const match = location.pathname.match(/^\/(\d+)\/favlist/);
        console.log('Current pathname:', location.pathname);
        if (!match) {
            console.error('无法从URL中获取UID');
            return null;
        }
        return match[1];
    }

    createDialog() {
        // 如果对话框已存在，只需显示
        if (this.dialogEl) {
            this.dialogEl.style.display = '';
            // 恢复导出状态和进度显示
            this.updateExportControls();
            if (this.exportState.exporting) {
                this.exportState.currentProgress.forEach((state) => {
                    this.updateProgress(
                        state.text,
                        state.item,
                        state.current,
                        state.total,
                        state.waiting,
                        state.finished
                    );
                });
            }
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'bilibili-exporter-dialog';
        dialog.innerHTML = `
      <div class="dialog-content">
        <h2>导出收藏夹</h2>
        
        <!-- 导出设置部分 -->
        <div class="section">
          <h3>导出设置</h3>
          <div class="settings-content">
            <div class="setting-item">
              <label class="kawaii-label">
                <span class="label-text">请求间隔时间</span>
                <div class="input-wrapper">
                  <input 
                    type="number" 
                    id="requestInterval" 
                    value="2" 
                    min="0.1" 
                    max="10" 
                    step="0.1"
                  >
                  <span class="unit">秒</span>
                </div>
              </label>
              <div class="tip">间隔时间越长越不容易被限制</div>
            </div>
            <div class="setting-item">
              <label class="kawaii-label">
                <input type="checkbox" id="saveCover" disabled>
                <span class="label-text">保存封面图片(暂未实现)</span>
              </label>
              <div class="tip">不保存可以减小导出文件大小</div>
            </div>
            <div class="setting-item">
              <label class="kawaii-label">
                <input type="checkbox" id="processInvalidVideo" checked>
                <span class="label-text">处理失效视频</span>
              </label>
              <div class="tip">尝试从其他来源获取失效视频的信息，会大幅度降低导出速度</div>
            </div>
          </div>
        </div>

        <!-- 导出内容部分 -->
        <div class="section">
          <h3>导出内容</h3>
          <div id="favoriteFolders" class="checkbox-list">
            ${this.state.initialized ? '' : '<div class="loading">正在加载收藏夹列表...</div>'}
          </div>
        </div>

        <div class="dialog-buttons">
          <button id="startExport">开始导出</button>
          <button id="abortExport" style="display: none;">停止导出</button>
          <button id="closeDialog">关闭</button>
        </div>
        <div id="exportProgress"></div>
      </div>
    `;

        document.body.appendChild(dialog);
        this.dialogEl = dialog;
        this.bindEvents();

        // 如果数据已初始化，立即渲染列表
        if (this.state.initialized) {
            this.render();
        }

        // 恢复导出状态
        this.updateExportControls();  // 确保按钮状态正确

        // 如果正在导出，恢复所有进度显示
        if (this.exportState.exporting) {
            this.exportState.currentProgress.forEach((state) => {
                this.updateProgress(
                    state.text,
                    state.item,
                    state.current,
                    state.total,
                    state.waiting,
                    state.finished
                );
            });
        }
    }

    // 数据加载
    async loadData() {
        if (this.state.loading) return; // 防止重复加载

        this.state.loading = true;
        if (this.dialogEl) {
            this.render(); // 显示加载状态
        }

        try {
            // 获取自建收藏夹（保持默认选中）
            const favResponse = await fetch(`https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${this.uid}`,
                { credentials: 'include' }
            );
            const favData = await favResponse.json();

            if (favData.code === 0 && favData.data) {
                this.state.favorites = favData.data.list.map(folder => ({
                    ...folder,
                    type: 'fav',
                    checked: true  // 自建收藏夹认选中
                }));
            }

            // 获取订阅合集（默认不选中）
            this.state.collections = await this.loadAllCollections();
            this.state.collections = this.state.collections.map(collection => ({
                ...collection,
                type: 'col',
                checked: false  // 合集默认不选中
            }));

            this.state.initialized = true;
        } catch (error) {
            console.error('加载失败:', error);
        } finally {
            this.state.loading = false;
            if (this.dialogEl) {
                this.render();
            }
        }
    }

    async loadAllCollections() {
        const collections = [];
        let pageNo = 1;
        const pageSize = 20;

        while (true) {
            const response = await fetch(
                `https://api.bilibili.com/x/v3/fav/folder/collected/list?pn=${pageNo}&ps=${pageSize}&up_mid=${this.uid}&platform=web`,
                { credentials: 'include' }
            );
            const data = await response.json();

            if (data.code !== 0) {
                throw new Error(data.message);
            }

            const { list, count, has_more } = data.data;
            collections.push(...list);

            if (!has_more || collections.length >= count) {
                break;
            }

            pageNo++;
        }

        return collections;
    }

    // 渲染列表
    render() {
        const container = this.dialogEl.querySelector('#favoriteFolders');

        // 生成基本结构
        const sections = [
            { title: '自建收藏夹', type: 'fav' },
            { title: '订阅合集', type: 'col' }
        ];

        const html = sections.map(section => `
      <div class="section">
        <div class="section-header">
          <div class="section-title">
            <span class="collapse-trigger">▶</span>
            <h3>${section.title}</h3>
          </div>
          <div class="section-controls">
            <input 
              type="text" 
              class="section-search" 
              placeholder="搜索${section.title === '自建收藏夹' ? '收藏夹' : '合集'}..."
              data-type="${section.type}"
              ${this.state.loading ? 'disabled' : ''}
            >
            <button class="select-all-section" data-type="${section.type}" ${this.state.loading ? 'disabled' : ''}>全选</button>
            <button class="invert-select-section" data-type="${section.type}" ${this.state.loading ? 'disabled' : ''}>反选</button>
          </div>
        </div>
        <div class="section-content collapsed">
          ${this.state.loading ?
                '<div class="loading">加载中... (。・ω・。)</div>' :
                this.generateSectionContent(section.type)
            }
        </div>
      </div>
    `).join('');

        container.innerHTML = html;

        // 如果数据载完成，恢复选中状态
        if (!this.state.loading && this.state.initialized) {
            this.restoreCheckState();
        }
    }

    // 新增生成section内容的方法
    generateSectionContent(type) {
        const items = type === 'fav' ? this.state.favorites : this.state.collections;
        return items.length ? items.map(item => `
      <label class="item" data-id="${item.type}_${item.id}">
        <div class="item-main">
          <input type="checkbox" ${item.checked ? 'checked' : ''}>
          <span class="item-title">${item.title} (${item.media_count}个视频)</span>
        </div>
        <div class="progress-wrapper" style="display: none;">
          <div class="progress-text waiting">
            <span class="waiting-icon">✿</span>
            <span>等待中...</span>
          </div>
          <div class="progress-bar" data-id="${item.type}_${item.id}">
            <div class="progress-inner"></div>
          </div>
        </div>
      </label>
    `).join('') : '<div class="empty">还没有内容呢 (｡>﹏<｡)</div>';
    }

    // 修改恢复选中状态的方法
    restoreCheckState() {
        // 选择收藏夹和合集的复选框，不包括设置选项的复选框
        const checkboxes = this.dialogEl.querySelectorAll('.item input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            const label = checkbox.closest('.item');
            if (!label || !label.dataset.id) {
                console.warn('找不到有效的 label 或 data-id:', label);
                return;
            }

            const [type, id] = label.dataset.id.split('_');
            if (!type || !id) {
                console.warn('无效的 data-id 格式:', label.dataset.id);
                return;
            }

            const items = type === 'fav' ? this.state.favorites : this.state.collections;
            const item = items.find(i => i.id.toString() === id);
            if (item) {
                checkbox.checked = item.checked;
            } else {
                console.warn('找不到对应的项目:', type, id);
            }
        });
    }

    // 绑定事件
    bindEvents() {
        // 关闭对话框 - 改为隐藏而不是移除
        this.dialogEl.querySelector('#closeDialog').addEventListener('click', async () => {
            if (this.exportState.exporting) {
                const shouldClose = await this.showKawaiiConfirm('正在导出中，确定要关闭吗？导出会继续在后台进行');
                if (!shouldClose) return;
            }
            // 只是隐藏对话框，不移除
            this.dialogEl.style.display = 'none';
        });

        // 导出
        this.dialogEl.querySelector('#startExport').addEventListener('click', () => {
            this.startExport();
        });

        // 复选框状态变化
        this.dialogEl.querySelector('#favoriteFolders').addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const label = e.target.closest('label');
                const [type, id] = label.dataset.id.split('_');
                const items = type === 'fav' ? this.state.favorites : this.state.collections;
                const item = items.find(i => i.id.toString() === id);
                if (item) {
                    item.checked = e.target.checked;
                }
            }
        });

        // section级别的事件处理
        this.dialogEl.querySelector('#favoriteFolders').addEventListener('click', (e) => {
            // 全选按钮
            if (e.target.classList.contains('select-all-section')) {
                const type = e.target.dataset.type;
                const items = type === 'fav' ? this.state.favorites : this.state.collections;
                items.forEach(item => item.checked = true);
                // 只更新复选框状态，不重新渲染整个列表
                this.restoreCheckState();
            }

            // 反选按钮
            if (e.target.classList.contains('invert-select-section')) {
                const type = e.target.dataset.type;
                const items = type === 'fav' ? this.state.favorites : this.state.collections;
                items.forEach(item => item.checked = !item.checked);
                // 只更新复选框状态，不重新渲染整个列表
                this.restoreCheckState();
            }
        });

        // 搜索框事件
        this.dialogEl.querySelector('#favoriteFolders').addEventListener('input', (e) => {
            if (e.target.classList.contains('section-search')) {
                const type = e.target.dataset.type;
                const searchText = e.target.value.toLowerCase();

                if (type === 'fav') {
                    this.state.favorites.forEach(item => {
                        const label = this.dialogEl.querySelector(`label[data-id="fav_${item.id}"]`);
                        if (label) {
                            label.style.display = item.title.toLowerCase().includes(searchText) ? '' : 'none';
                        }
                    });
                } else if (type === 'col') {
                    this.state.collections.forEach(item => {
                        const label = this.dialogEl.querySelector(`label[data-id="col_${item.id}"]`);
                        if (label) {
                            label.style.display = item.title.toLowerCase().includes(searchText) ? '' : 'none';
                        }
                    });
                }
            }
        });

        // 修改折叠事件监听
        this.dialogEl.addEventListener('click', (e) => {
            // 如果点击的是按钮、搜索框或复选框，不处理折叠
            if (e.target.matches('button, input')) {
                return;
            }

            // 只有点击标题区域才触发折叠
            const sectionTitle = e.target.closest('.section-title');
            if (sectionTitle) {
                const section = sectionTitle.closest('.section');
                const content = section.querySelector('.section-content');
                const trigger = section.querySelector('.collapse-trigger');

                const isCollapsed = content.classList.toggle('collapsed');
                trigger.textContent = isCollapsed ? '▶' : '▼';
            }
        });

        this.dialogEl.querySelector('#abortExport').addEventListener('click', async () => {
            const confirmed = await this.abortExport();
            if (confirmed) {
                this.showKawaiiTip('正在停止导出... (。・ω・。)', 'info');
            }
        });


    }

    // 获取收藏夹内容
    async getFolderContent(folderId, page = 1, pageSize = 20) {
        // 检查是否已终止
        if (this.exportState.aborted) {
            throw new Error('aborted');
        }

        const response = await fetch(
            `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${folderId}&pn=${page}&ps=${pageSize}&keyword=&order=mtime&type=0&tid=0&platform=web`,
            { credentials: 'include' }
        );
        const data = await response.json();
        if (data.code !== 0) {
            throw new Error(data.message);
        }
        return data.data;
    }

    // 获取合集内容
    async getCollectionContent(collectionId, page = 1, pageSize = 20) {
        // 检查是否已终止
        if (this.exportState.aborted) {
            throw new Error('aborted');
        }

        const response = await fetch(
            `https://api.bilibili.com/x/space/fav/season/list?season_id=${collectionId}&pn=${page}&ps=${pageSize}&keyword=&order=mtime&type=0&tid=0&platform=web`,
            { credentials: 'include' }
        );
        const data = await response.json();
        if (data.code !== 0) {
            throw new Error(data.message);
        }
        return data.data;
    }

    // 获取导出设置
    getExportSettings() {
        return {
            interval: parseFloat(document.getElementById('requestInterval').value) * 1000,
            // saveCover: document.getElementById('saveCover').checked,  // 移除这个选项
            processInvalidVideo: document.getElementById('processInvalidVideo').checked
        };
    }

    // 修改开始导出方法，使用统一的设置
    async startExport() {
        if (this.exportState.exporting) return;

        const settings = this.getExportSettings();
        const selectedItems = [
            ...this.state.favorites.filter(f => f.checked),
            ...this.state.collections.filter(c => c.checked)
        ];

        if (selectedItems.length === 0) {
            this.showKawaiiTip('请至少选择一个收藏夹或合集 (。>︿<｡)', 'warning');
            return;
        }

        // 添加开始导出的提示
        this.showKawaiiTip('开始导出，请不要关闭或刷新页面 (。>ω<。)', 'info');

        this.exportState.exporting = true;
        this.exportState.aborted = false;
        this.updateExportControls();

        // 显示所有选中项的等待状态
        selectedItems.forEach(item => {
            this.updateProgress('等待中...', item, 0, 0, true, false);
        });

        const results = {
            favorites: [],
            collections: []
        };

        try {
            for (const item of selectedItems) {
                // 更新当前项为进行中状态
                this.updateProgress(`正在获取 ${item.title}`, item, 0, item.media_count, false, false);

                if (item.type === 'fav') {
                    try {
                        const result = await this.exportFavoriteFolder(item, settings);
                        results.favorites.push(result);
                    } catch (error) {
                        console.error(error);
                    }
                } else {
                    try {
                        const result = await this.exportCollection(item, settings);
                        results.collections.push(result);
                    } catch (error) {
                        console.error(error);
                    }
                }
            }

            // 导出完成，下载文件
            if (!this.exportState.aborted) {
                const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `bilibili-favorites-${this.uid}-${Date.now()}.json`;
                a.click();
                URL.revokeObjectURL(url);

                this.showKawaiiTip('导出完成啦! ٩(◕‿◕｡)۶', 'success');
            }
        } catch (error) {
            if (error.message !== 'aborted') {
                console.error('导出错误:', error);
                this.showKawaiiTip('导出出错了... (。>︿<｡)', 'error');
            }
        } finally {
            this.exportState.exporting = false;
            this.updateExportControls();
        }
    }

    // 修改处理失效视频的方法，使用统一的设置
    async processInvalidVideos(medias, processInvalidVideo, saveCover) {

        // 确保 medias 是数组
        if (!Array.isArray(medias) || !medias) {
            console.warn('medias 不是数组:', medias);
            return [];
        }

        for (let i = 0; i < medias.length; i++) {
            if (this.exportState.aborted) {
                throw new Error('aborted');
            }
            const media = medias[i];
            // 确保 media 是对象
            if (!media || typeof media !== 'object') {
                console.warn('无效的 media 对象:', media);
                continue;
            }

            const isInvalid = media.title === '已失效视频' ||
                media.cover === 'http://i0.hdslb.com/bfs/archive/be27fd62c99036dce67efface486fb0a88ffed06.jpg';

            if (isInvalid) {
                media.invalid = true; // 始终标记失效状态

                if (processInvalidVideo) {
                    try {
                        const info = await this.fetchBiliplusInfo(media.bvid);
                        if (info) {
                            media.title = `[已失效] ${info.title}`;
                            media.intro = info.intro || media.intro;
                            media.cover = info.pic || media.cover;
                            media.duration = info.duration || media.duration;
                            media.pubtime = info.pubtime || media.pubtime;
                            media.biliplus_link = `https://www.biliplus.com/video/av${info.aid}/`;
                            continue;
                        }
                    } catch (error) {
                        console.warn('获取失效视频信息失败:', error);
                    }
                }

                // 如果不处理失效视频或获取信息失败使用默认标记
                media.title = `[已失效] 未知视频`;
                // if (!saveCover) {
                //     // media.cover = null;
                // }
            } else {
                media.invalid = false;
                // if (!saveCover) {
                //     // media.cover = null;
                // }
            }
        }

        return medias;
    }

    // 修改从 biliplus 获取视频信息的方法
    async fetchBiliplusInfo(bvid) {
        // 先转换 bvid，避免在 sendMessage 之前就出错
        let avid;
        try {
            avid = this.bv2av(bvid);
        } catch (error) {
            console.warn('BV号转换失败:', error);
            return null;
        }

        // 封装 chrome.runtime.sendMessage 为 Promise
        function sendMessage(url) {
            return new Promise((resolve, reject) => {
                try {
                    chrome.runtime.sendMessage({ type: 'fetchBiliplus', url }, (response) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else if (response && response.error) {
                            // 处理请求失败的情况
                            reject(new Error(`请求失败: ${response.error}`));
                        } else {
                            resolve(response);
                        }
                    });
                } catch (error) {
                    reject(error);
                }
            });
        }

        try {
            // 1. 先尝试常规查询
            const html = await sendMessage(`https://www.biliplus.com/video/av${avid}/`);
            try {
                const jsonMatch = html.match(/window\.addEventListener\('DOMContentLoaded',function\(\){view\((.+)\);}\);/);
                if (jsonMatch) {
                    const data = JSON.parse(jsonMatch[1]);
                    if (data.aid &&data.title) {
                        return {
                            aid: avid,
                            title: data.title,
                            intro: data.description,
                            pic: data.pic,
                            duration: data.v2_app_api?.duration || 0,
                            pubtime: data.created,
                        };
                    }
                }
            } catch (parseError) {
                console.warn('常规查询结果解析失败:', parseError);
            }
        } catch (error) {
            console.warn('常规查询失败:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        // 2. 尝试API查询
        try {
            const response = await sendMessage(`https://www.biliplus.com/api/view?id=${avid}`);
            const data = JSON.parse(response);
            if (data && data.title) {
                return {
                    aid: avid,
                    title: data.title,
                    intro: data.description,
                    pic: data.pic,
                    duration: data.v2_app_api?.duration || 0,
                    pubtime: data.created,
                };
            }
        } catch (error) {
            console.warn('API查询失败:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));

        // 3. 尝试历史归档查询
        try {
            const html = await sendMessage(`https://www.biliplus.com/all/video/av${avid}/`);
            const params = html.match(/getjson\('(\/api\/view_all.+)'/);
            if (params) {
                const allDataResponse = await sendMessage(`https://www.biliplus.com${params[1]}`);
                const allData = JSON.parse(allDataResponse);
                if (allData.code === 0 && allData.data && allData.data.info) {
                    return {
                        aid: avid,
                        title: allData.data.info.title,
                        intro: allData.data.info.desc,
                        pic: allData.data.info.pic,
                        duration: allData.data.info.duration,
                        pubtime: allData.data.info.pubdate,
                    };
                }
            }
        } catch (error) {
            console.warn('历史归档查询失败:', error);
        }

        return null;
    }

    // 添加 BV 号转 AV 号的方法
    bv2av(bvid) {
        const XOR_CODE = 23442827791579n;
        const MASK_CODE = 2251799813685247n;
        const BASE = 58n;
        const CHAR_TABLE = "FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf";

        const bvidArr = Array.from(bvid);
        [bvidArr[3], bvidArr[9]] = [bvidArr[9], bvidArr[3]];
        [bvidArr[4], bvidArr[7]] = [bvidArr[7], bvidArr[4]];
        bvidArr.splice(0, 3);
        const tmp = bvidArr.reduce((pre, bvidChar) => pre * BASE + BigInt(CHAR_TABLE.indexOf(bvidChar)), 0n);
        return Number((tmp & MASK_CODE) ^ XOR_CODE);
    }

    // 修改导出收藏夹的方法
    async exportFavoriteFolder(folder, settings) {
        const result = {
            id: folder.id,
            title: folder.title,
            cover: null,
            upper: null,
            intro: null,
            media_count: folder.media_count,
            ctime: null,
            mtime: null,
            medias: []
        };

        let page = 1;
        const pageSize = 20;

        try {
            while (true) {
                if (this.exportState.aborted) {
                    throw new Error('aborted');
                }

                const data = await this.getFolderContent(folder.id, page, pageSize);
                // 在第一次获取时，设置基本信息
                if (page === 1) {
                    result.cover = data.info.cover;
                    result.title = data.info.title;
                    result.upper = data.info.upper;
                    result.intro = data.info.intro;
                    result.ctime = data.info.ctime;
                    result.mtime = data.info.mtime;
                }

                // 处理失效视频
                const processedMedias = await this.processInvalidVideos(data.medias || [], settings.processInvalidVideo, settings.saveCover);
                result.medias.push(...processedMedias);

                this.updateProgress(
                    `正在获取 ${folder.title}`,
                    folder,
                    result.medias.length,
                    result.media_count,
                    false,
                    false
                );

                if (result.medias.length >= result.media_count || !data.has_more) {
                    this.updateProgress(`已获取 ${folder.title}`, folder, result.medias.length, result.media_count, false, true);
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, settings.interval));
                page++;
            }
            return result;
        } catch (error) {
            if (error.message === 'aborted') {
                this.updateProgress(`已停止获取 ${folder.title}`, folder);
                throw error;
            }
            throw error;
        }
    }

    // 修改导出合集的方法
    async exportCollection(collection, settings) {
        const result = {
            id: collection.id,
            title: collection.title,
            intro: collection.intro,
            media_count: collection.media_count,
            upper: collection.upper,
            cover: collection.cover,
            ctime: collection.ctime,
            mtime: collection.mtime,
            link: collection.link,
            items: [],
        };

        let page = 1;
        const pageSize = 20;

        try {
            while (true) {
                if (this.exportState.aborted) {
                    throw new Error('aborted');
                }

                const data = await this.getCollectionContent(collection.id, page, pageSize);

                // 处理失效视频
                const processedMedias = await this.processInvalidVideos(data.medias || [], settings.processInvalidVideo, settings.saveCover);
                result.items.push(...processedMedias);

                this.updateProgress(
                    `正在获取 ${collection.title}`,
                    collection,
                    result.items.length,
                    collection.media_count,
                    false,
                    false
                );

                if (result.items.length >= collection.media_count || !data.has_more) {
                    this.updateProgress(`已获取 ${collection.title}`, collection, result.items.length, collection.media_count, false, true);
                    break;
                }

                await new Promise(resolve => setTimeout(resolve, settings.interval));
                page++;
            }
            return result;
        } catch (error) {
            if (error.message === 'aborted') {
                this.updateProgress(`停止获取 ${collection.title}`, collection);
                throw error;
            }
            throw error;
        }
    }

    updateProgress(text, item = null, current = 0, total = 0, waiting = false, finished = false) {
        // 保存进度状态
        if (item) {
            this.exportState.currentProgress.set(`${item.type}_${item.id}`, {
                text,
                current,
                total,
                item,
                waiting,
                finished
            });
        }

        // 如果dialog存在，更新UI
        if (this.dialogEl) {
            if (item) {
                const label = this.dialogEl.querySelector(`label[data-id="${item.type}_${item.id}"]`);
                if (label) {
                    const progressWrapper = label.querySelector('.progress-wrapper');
                    const progressText = progressWrapper.querySelector('.progress-text');
                    const progressBar = progressWrapper.querySelector('.progress-bar');
                    const innerBar = progressBar.querySelector('.progress-inner');

                    progressWrapper.style.display = 'block';

                    if (waiting) {
                        // 显示等待状态
                        progressText.className = 'progress-text waiting';
                        progressText.innerHTML = `
                            <span class="waiting-icon">✿</span>
                            <span>等待中...</span>
                        `;
                        innerBar.style.width = '0%';
                    } else {
                        // 显示进度状态
                        progressText.className = 'progress-text';
                        progressText.textContent = `${current}/${total}`;
                        if (total > 0) {
                            innerBar.style.width = `${current / total * 100}%`;
                        } else {
                            innerBar.style.width = '100%';
                        }

                        if (finished) {
                            innerBar.style.backgroundColor = '#52c41a';
                        } else {
                            innerBar.style.backgroundColor = '#fb7299';
                        }
                    }
                }
            }

            this.dialogEl.querySelector('#exportProgress').textContent = text;
        }
    }

    // 添加终止导出方法
    async abortExport() {
        const tipEl = document.createElement('div');
        tipEl.className = 'kawaii-confirm';
        tipEl.innerHTML = `
      <div class="confirm-content">
        <div class="confirm-text">
          <span class="confirm-icon">❀</span>
          <span>确定要停止导出？(。>︿<｡)</span>
        </div>
        <div class="confirm-buttons">
          <button class="confirm-yes">停止导出</button>
          <button class="confirm-no">继续导出</button>
        </div>
      </div>
    `;

        document.body.appendChild(tipEl);
        setTimeout(() => tipEl.classList.add('show'), 10);

        try {
            return await new Promise((resolve) => {
                const handleConfirm = (confirmed) => {
                    tipEl.classList.remove('show');
                    setTimeout(() => {
                        tipEl.remove();
                        if (confirmed) {
                            this.exportState.aborted = true;
                        }
                        resolve(confirmed);
                    }, 300);
                };

                tipEl.querySelector('.confirm-yes').addEventListener('click', () => handleConfirm(true));
                tipEl.querySelector('.confirm-no').addEventListener('click', () => handleConfirm(false));
            });
        } catch (error) {
            console.error('确认框出错了:', error);
            return false;
        }
    }

    // 更新导出控制按钮
    updateExportControls() {
        if (this.dialogEl) {
            const startBtn = this.dialogEl.querySelector('#startExport');
            const abortBtn = this.dialogEl.querySelector('#abortExport');
            const checkboxes = this.dialogEl.querySelectorAll('.item input[type="checkbox"]');

            if (this.exportState.exporting) {
                // 正在导出时
                startBtn.style.display = 'none';
                abortBtn.style.display = 'block';

                // 禁用所有复选框
                checkboxes.forEach(checkbox => {
                    checkbox.disabled = true;
                });
            } else {
                // 未在导出时
                startBtn.style.display = 'block';
                abortBtn.style.display = 'none';

                // 启用所有复选框
                checkboxes.forEach(checkbox => {
                    checkbox.disabled = false;
                });

                // 隐藏所有进度条
                const progressWrappers = this.dialogEl.querySelectorAll('.progress-wrapper');
                progressWrappers.forEach(wrapper => {
                    wrapper.style.display = 'none';
                });
            }
        }
    }

    // 添加可爱的提示框
    showKawaiiTip(message, type = 'info') {
        const tipEl = document.createElement('div');
        tipEl.className = `kawaii-tip ${type}`;
        tipEl.innerHTML = `
      <div class="tip-content">
        <span class="tip-icon">${this.getTipIcon(type)}</span>
        <span class="tip-text">${message}</span>
      </div>
    `;

        document.body.appendChild(tipEl);

        // 添加动画类
        setTimeout(() => tipEl.classList.add('show'), 10);

        // 3秒后消失
        setTimeout(() => {
            tipEl.classList.remove('show');
            setTimeout(() => tipEl.remove(), 300);
        }, 3000);
    }

    getTipIcon(type) {
        switch (type) {
            case 'success': return '✿';
            case 'warning': return '❀';
            case 'error': return '✾';
            default: return '❁';
        }
    }

    // 修改检查URL的方法
    static shouldInitialize(pathname = location.pathname) {
        return /^\/\d+\/favlist/.test(pathname);
    }

    // 修改添加按钮的方法
    addExportButton() {
        // 等待目标容器加载完成
        const targetContainer = document.querySelector('.favlist-main');
        if (!targetContainer) {
            // 如果容器还没加载，等待一会儿再试
            setTimeout(() => this.addExportButton(), 500);
            return;
        }

        const exportBtn = document.createElement('div');
        exportBtn.className = 'export-favorites-btn';
        exportBtn.innerHTML = `导出收藏夹`;

        document.body.appendChild(exportBtn);
        exportBtn.addEventListener('click', () => {
            this.createDialog();
            if (!this.state.initialized) {
                this.loadData();
            }
        });
    }

    // 添加一个可爱的确认框方法
    async showKawaiiConfirm(message) {
        const tipEl = document.createElement('div');
        tipEl.className = 'kawaii-confirm';
        tipEl.innerHTML = `
            <div class="confirm-content">
                <div class="confirm-text">
                    <span class="confirm-icon">❀</span>
                    <span>${message}</span>
                </div>
                <div class="confirm-buttons">
                    <button class="confirm-yes">确定</button>
                    <button class="confirm-no">取消</button>
                </div>
            </div>
        `;

        document.body.appendChild(tipEl);
        setTimeout(() => tipEl.classList.add('show'), 10);

        try {
            return await new Promise((resolve) => {
                const handleConfirm = (confirmed) => {
                    tipEl.classList.remove('show');
                    setTimeout(() => {
                        tipEl.remove();
                        resolve(confirmed);
                    }, 300);
                };

                tipEl.querySelector('.confirm-yes').addEventListener('click', () => handleConfirm(true));
                tipEl.querySelector('.confirm-no').addEventListener('click', () => handleConfirm(false));
            });
        } catch (error) {
            console.error('确认框出错了:', error);
            return false;
        }
    }
}

// 修改初始化部分
const initializeExporter = () => {
    let currentExporter = null;
    let lastUrl = location.href;

    // 检查并初始化按钮
    const tryInitButton = () => {
        // 检查URL是否变化
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            // 移除旧的按钮和实例
            const oldBtn = document.querySelector('.export-favorites-btn');
            if (oldBtn) {
                oldBtn.remove();
                currentExporter = null;
            }
        }

        // 检查是否应该初始化
        if (!BilibiliExporter.shouldInitialize()) {
            return;
        }

        // 检查是否已存在按钮
        if (document.querySelector('.export-favorites-btn')) {
            return;
        }

        // 检查目标容器是否存在
        currentExporter = new BilibiliExporter();
        currentExporter.addExportButton();
    };

    // 监听 pushState 和 replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
        originalPushState.apply(this, arguments);
        tryInitButton();
    };

    history.replaceState = function () {
        originalReplaceState.apply(this, arguments);
        tryInitButton();
    };

    // 监听 popstate 事件（后退/前进按钮）
    window.addEventListener('popstate', tryInitButton);

    // 使用 MutationObserver 监听 DOM 变化
    const observer = new MutationObserver(() => {
        requestAnimationFrame(tryInitButton);
    });

    // 监听主要内容区域的变化
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // 立即执行一次检查
    tryInitButton();
};

// 初始化
window.addEventListener('load', () => {
    initializeExporter();
}); 