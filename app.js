/**
 * 포트폴리오 소개 페이지 - 우클릭 위치 생성, 드래그 이동
 */

let editMode = false;
let lastRightClick = { x: 0, y: 0, pageId: null, canvas: null };

const STORAGE_KEY = 'portfolio_canvas_data';
const GRID_SNAP = 8; // 배치 보정용 그리드 간격 (px)
const PUBLISHED_DATA_GLOBAL = '__PUBLISHED_PORTFOLIO_DATA__';

function isEditSession() {
    try {
        const params = new URLSearchParams(location.search || '');
        return params.get('edit') === '1';
    } catch {
        return false;
    }
}

// ===== GitHub API 연동 =====
const GITHUB_SETTINGS_KEY = 'portfolio_github_settings_v1';
const GITHUB_CACHE_KEY = 'portfolio_github_cache_v1';
const GITHUB_CACHE_TTL_MS = 10 * 60 * 1000;
const GITHUB_DEFAULT_USERNAME = 'kinetas';

const dynamicItemConfig = {
    paper: { title: '논문 추가', fields: [
        { name: 'title', label: '논문명', type: 'text' },
        { name: 'journal', label: '학술지/학회', type: 'text' },
        { name: 'date', label: '발표일', type: 'text' }
    ]},
    certification: { title: '자격증 추가', fields: [
        { name: 'name', label: '자격증명', type: 'text' },
        { name: 'org', label: '발급기관', type: 'text' },
        { name: 'date', label: '취득일', type: 'text' }
    ]},
    program: { title: '프로그램 추가', fields: [
        { name: 'name', label: '프로그램명', type: 'text' },
        { name: 'level', label: '숙련도 (선택)', type: 'text' }
    ]},
    project: { title: '프로젝트 추가', fields: [
        { name: 'name', label: '프로젝트명', type: 'text' },
        { name: 'role', label: '역할', type: 'text' },
        { name: 'desc', label: '설명 (선택)', type: 'text' }
    ]}
};

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initEditMode();
    initToolbox();
    initModals();
    initDrag();
    initProjectHoverPreview();
    // 배포 후에는 published_data.js의 고정 데이터를 먼저 로드
    // (편집 세션에서는 localStorage 기반으로 작업)
    if (!isEditSession()) {
        const loaded = loadPublishedData();
        if (!loaded) loadSavedData();
    } else {
        loadSavedData();
    }
    updateDeleteButtonsVisibility();
    initGithubPage();
});

// ===== 네비게이션 =====
function initNavigation() {
    const links = Array.from(document.querySelectorAll('.nav-link'))
        .filter(a => (a.getAttribute('href') || '').startsWith('#'));

    const getHeaderOffset = () => {
        const editBar = document.querySelector('.edit-mode-bar');
        const nav = document.querySelector('.main-nav');
        const h1 = editBar ? editBar.offsetHeight : 0;
        const h2 = nav ? nav.offsetHeight : 0;
        return h1 + h2 + 12;
    };

    const scrollToSection = (el, behavior = 'smooth') => {
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.scrollY - getHeaderOffset();
        window.scrollTo({ top: Math.max(0, y), behavior });
    };

    const setActive = (id) => {
        links.forEach(l => {
            const href = l.getAttribute('href') || '';
            l.classList.toggle('active', href === `#${id}`);
        });
    };

    links.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href') || '';
            const id = decodeURIComponent(href.slice(1));
            const target = document.getElementById(id);
            if (!target) return;
            e.preventDefault();
            scrollToSection(target, 'smooth');
            history.replaceState(null, '', `#${id}`);
            setActive(id);
        });
    });

    const sectionIds = links
        .map(l => decodeURIComponent((l.getAttribute('href') || '').slice(1)))
        .filter(Boolean);
    const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);

    if ('IntersectionObserver' in window && sections.length) {
        const observer = new IntersectionObserver((entries) => {
            const visible = entries
                .filter(e => e.isIntersecting)
                .sort((a, b) => (b.intersectionRatio || 0) - (a.intersectionRatio || 0))[0];
            if (visible?.target?.id) setActive(visible.target.id);
        }, {
            root: null,
            threshold: [0.12, 0.25, 0.4, 0.6],
            rootMargin: `-${getHeaderOffset()}px 0px -60% 0px`
        });

        sections.forEach(s => observer.observe(s));

        window.addEventListener('resize', () => {
            observer.disconnect();
            sections.forEach(s => observer.observe(s));
        });
    }

    requestAnimationFrame(() => {
        const raw = (location.hash || '').slice(1);
        const id = raw ? decodeURIComponent(raw) : '';
        const target = id ? document.getElementById(id) : null;
        if (target) {
            scrollToSection(target, 'auto');
            setActive(id);
        } else if (sections[0]?.id) {
            setActive(sections[0].id);
        }
    });
}

// ===== 편집모드 =====
function initEditMode() {
    const toggle = document.getElementById('editModeToggle');
    const status = document.querySelector('.edit-status');
    const bar = document.querySelector('.edit-mode-bar');

    // 배포/일반 방문에서는 편집 UI 숨김 (URL에 ?edit=1이면 표시)
    if (!isEditSession()) {
        if (bar) bar.style.display = 'none';
        editMode = false;
        updateDeleteButtonsVisibility();
        return;
    }

    toggle?.addEventListener('click', () => {
        editMode = !editMode;
        toggle.textContent = editMode ? '편집모드 종료' : '편집모드';
        toggle.classList.toggle('active', editMode);
        status.textContent = editMode ? '편집 가능 (우클릭)' : '편집 불가';

        document.querySelectorAll('.dynamic-area').forEach(area => {
            area.classList.toggle('edit-zone', editMode);
        });

        updateDeleteButtonsVisibility();
        if (!editMode) {
            hideToolbox();
            saveAllData();
        }
    });
}

// 편집모드에서만 삭제 버튼 표시
function updateDeleteButtonsVisibility() {
    document.body.classList.toggle('edit-mode', editMode);
    document.querySelectorAll('.box-delete, .item-delete, .table-delete, .label-delete, .image-delete').forEach(btn => {
        btn.style.pointerEvents = editMode ? '' : 'none';
        btn.style.visibility = editMode ? '' : 'hidden';
    });
}

// ===== 툴박스 - 편집모드에서 캔버스 영역 우클릭 시 =====
function initToolbox() {
    document.addEventListener('contextmenu', (e) => {
        if (!editMode) return;

        const canvas = e.target.closest('.canvas-area');
        if (!canvas) return;

        e.preventDefault();
        lastRightClick = {
            x: e.clientX,
            y: e.clientY,
            pageId: canvas.dataset.pageId,
            canvas
        };

        const toolbox = document.getElementById('contextToolbox');
        toolbox.innerHTML = '';

        const addBtn = (text, action) => {
            const btn = document.createElement('button');
            btn.className = 'tool-btn';
            btn.textContent = text;
            btn.onclick = () => { hideToolbox(); handleToolAction(action); };
            toolbox.appendChild(btn);
        };

        addBtn('컨텐츠 박스 추가', 'addContentBox');
        addBtn('이미지 추가', 'addImage');
        addBtn('표 추가', 'addTable');
        addBtn('검색', 'search');

        if (lastRightClick.pageId === 'career') addBtn('논문 추가', 'addPaper');
        if (lastRightClick.pageId === 'skills') {
            addBtn('구역 제목 추가', 'addSectionLabel');
            addBtn('자격증 추가', 'addCertification');
            addBtn('프로그램 추가', 'addProgram');
        }
        if (lastRightClick.pageId === 'portfolio') addBtn('프로젝트 추가', 'addProject');

        showToolbox(e.clientX, e.clientY);
    });

    document.addEventListener('click', () => hideToolbox());
}

function showToolbox(x, y) {
    const toolbox = document.getElementById('contextToolbox');
    toolbox.classList.remove('hidden');
    toolbox.style.left = `${x}px`;
    toolbox.style.top = `${y}px`;
    const rect = toolbox.getBoundingClientRect();
    if (rect.right > window.innerWidth) toolbox.style.left = `${x - rect.width}px`;
    if (rect.bottom > window.innerHeight) toolbox.style.top = `${y - rect.height}px`;
}

function hideToolbox() {
    document.getElementById('contextToolbox').classList.add('hidden');
}

function handleToolAction(action) {
    switch (action) {
        case 'addContentBox': openContentBoxModal(); break;
        case 'addImage': openImageModal(); break;
        case 'addTable': openTableModal(); break;
        case 'search': openSearchModal(); break;
        case 'addSectionLabel': addSectionLabel(); break;
        case 'addPaper': openDynamicItemModal('paper'); break;
        case 'addCertification': openDynamicItemModal('certification'); break;
        case 'addProgram': openDynamicItemModal('program'); break;
        case 'addProject': openDynamicItemModal('project'); break;
    }
}

// ===== 캔버스 기준 좌표 계산 (그리드 스냅 적용) =====
function snapToGrid(val) {
    return Math.round(val / GRID_SNAP) * GRID_SNAP;
}

function getCanvasPosition(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const left = clientX - rect.left + (canvas.scrollLeft || 0);
    const top = clientY - rect.top + (canvas.scrollTop || 0);
    return {
        left: Math.max(0, snapToGrid(left)),
        top: Math.max(0, snapToGrid(top))
    };
}

// ===== 드래그 =====
function initDrag() {
    document.addEventListener('mousedown', (e) => {
        if (!editMode) return;
        const item = e.target.closest('.draggable-item');
        if (!item) return;

        if (e.target.closest('.box-delete, .item-delete, .table-delete, .label-delete, .image-delete')) return;
        if (e.target.closest('[contenteditable="true"]')) return;
        if (item.classList.contains('table-wrapper') && !e.target.closest('.table-drag-handle')) return;

        e.preventDefault();
        const canvas = item.closest('.canvas-area');
        if (!canvas) return;

        const itemRect = item.getBoundingClientRect();
        const offsetX = e.clientX - itemRect.left;
        const offsetY = e.clientY - itemRect.top;

        item.classList.add('dragging');

        const onMove = (ev) => {
            const cr = canvas.getBoundingClientRect();
            const left = snapToGrid(ev.clientX - cr.left - offsetX);
            const top = snapToGrid(ev.clientY - cr.top - offsetY);
            item.style.left = `${Math.max(0, left)}px`;
            item.style.top = `${Math.max(0, top)}px`;
        };

        const onUp = () => {
            item.classList.remove('dragging');
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            ensureCanvasHeight(canvas);
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// ===== 컨텐츠 박스 =====
function openContentBoxModal() {
    document.getElementById('contentBoxModal').classList.remove('hidden');
    document.getElementById('contentBoxText').value = '';
    document.getElementById('contentBoxTags').value = '';
    document.getElementById('contentBoxImage').value = '';
}

function addContentBox() {
    const text = document.getElementById('contentBoxText').value.trim();
    const tags = document.getElementById('contentBoxTags').value.trim();
    const imageUrl = document.getElementById('contentBoxImage').value.trim();

    if (!lastRightClick.canvas) return;

    const pos = getCanvasPosition(lastRightClick.canvas, lastRightClick.x, lastRightClick.y);
    const colors = ['yellow', 'blue', 'green'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const box = document.createElement('div');
    box.className = `content-box draggable-item ${color}`;
    box.dataset.id = 'box_' + Date.now();
    box.dataset.type = 'contentBox';
    box.dataset.pageId = lastRightClick.pageId;
    box.style.left = pos.left + 'px';
    box.style.top = pos.top + 'px';

    let html = '';
    if (text) html += `<div class="box-text">${escapeHtml(text)}</div>`;
    if (imageUrl) html += `<img src="${escapeHtml(imageUrl)}" alt="이미지" onerror="this.style.display='none'">`;
    if (tags) html += `<div class="box-tags">#${tags.split(',').map(t => t.trim()).join(' #')}</div>`;
    box.innerHTML = html + `<button class="box-delete" aria-label="삭제">×</button>`;

    box.querySelector('.box-delete')?.addEventListener('click', (e) => { e.stopPropagation(); box.remove(); });

    lastRightClick.canvas.appendChild(box);
    ensureCanvasHeight(lastRightClick.canvas);
    updateDeleteButtonsVisibility();
    document.getElementById('contentBoxModal').classList.add('hidden');
}

// ===== 표 =====
function openTableModal() {
    document.getElementById('tableModal').classList.remove('hidden');
    document.getElementById('tableRows').value = 3;
    document.getElementById('tableCols').value = 3;
}

function addTable() {
    const rows = parseInt(document.getElementById('tableRows').value) || 3;
    const cols = parseInt(document.getElementById('tableCols').value) || 3;
    if (!lastRightClick.canvas) return;

    const pos = getCanvasPosition(lastRightClick.canvas, lastRightClick.x, lastRightClick.y);

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper draggable-item';
    wrapper.dataset.id = 'table_' + Date.now();
    wrapper.dataset.type = 'table';
    wrapper.dataset.pageId = lastRightClick.pageId;
    wrapper.style.left = pos.left + 'px';
    wrapper.style.top = pos.top + 'px';

    let tableHtml = '<table class="data-table"><thead><tr>';
    for (let c = 0; c < cols; c++) tableHtml += `<th contenteditable="true">제목${c + 1}</th>`;
    tableHtml += '</tr></thead><tbody>';
    for (let r = 0; r < rows - 1; r++) {
        tableHtml += '<tr>';
        for (let c = 0; c < cols; c++) tableHtml += `<td contenteditable="true"></td>`;
        tableHtml += '</tr>';
    }
    tableHtml += '</tbody></table><div class="table-drag-handle" title="드래그하여 이동">⋮⋮</div><button class="table-delete">표 삭제</button>';

    wrapper.innerHTML = tableHtml;
    wrapper.querySelector('.table-delete')?.addEventListener('click', () => wrapper.remove());

    lastRightClick.canvas.appendChild(wrapper);
    ensureCanvasHeight(lastRightClick.canvas);
    updateDeleteButtonsVisibility();
    document.getElementById('tableModal').classList.add('hidden');
}

// ===== 이미지 추가 =====
function openImageModal() {
    document.getElementById('imageModal').classList.remove('hidden');
    document.getElementById('imageUrl').value = '';
    document.getElementById('imageFile').value = '';
    document.getElementById('imageFileName').textContent = '';
}

function addImage() {
    const urlInput = document.getElementById('imageUrl').value.trim();
    const fileInput = document.getElementById('imageFile');

    if (urlInput) {
        addImageToCanvas(urlInput);
        document.getElementById('imageModal').classList.add('hidden');
    } else if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            addImageToCanvas(e.target.result);
            document.getElementById('imageModal').classList.add('hidden');
        };
        reader.readAsDataURL(file);
    }
}

function addImageToCanvas(src) {
    if (!lastRightClick.canvas) return;

    const pos = getCanvasPosition(lastRightClick.canvas, lastRightClick.x, lastRightClick.y);

    const wrapper = document.createElement('div');
    wrapper.className = 'image-item draggable-item';
    wrapper.dataset.id = 'image_' + Date.now();
    wrapper.dataset.type = 'image';
    wrapper.dataset.pageId = lastRightClick.pageId;
    wrapper.style.left = pos.left + 'px';
    wrapper.style.top = pos.top + 'px';

    const img = document.createElement('img');
    img.src = src;
    img.alt = '이미지';
    img.draggable = false;
    wrapper.appendChild(img);
    const delBtn = document.createElement('button');
    delBtn.className = 'image-delete';
    delBtn.setAttribute('aria-label', '삭제');
    delBtn.textContent = '×';
    wrapper.appendChild(delBtn);

    wrapper.querySelector('.image-delete')?.addEventListener('click', (e) => {
        e.stopPropagation();
        wrapper.remove();
    });

    lastRightClick.canvas.appendChild(wrapper);
    ensureCanvasHeight(lastRightClick.canvas);
    updateDeleteButtonsVisibility();
}

// ===== 구역 제목 (자격증/프로그램 등 구역 나누기용) =====
function addSectionLabel() {
    if (!lastRightClick.canvas) return;

    const label = prompt('구역 제목 (예: 자격증, 다룰 수 있는 프로그램)', '자격증');
    if (!label || !label.trim()) return;

    const pos = getCanvasPosition(lastRightClick.canvas, lastRightClick.x, lastRightClick.y);

    const el = document.createElement('div');
    el.className = 'section-label draggable-item';
    el.dataset.id = 'section_' + Date.now();
    el.dataset.type = 'sectionLabel';
    el.dataset.pageId = lastRightClick.pageId;
    el.style.left = pos.left + 'px';
    el.style.top = pos.top + 'px';
    el.innerHTML = `<span class="label-text">${escapeHtml(label.trim())}</span><button class="label-delete" aria-label="삭제">×</button>`;

    el.querySelector('.label-delete')?.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
    el.addEventListener('dblclick', (e) => {
        if (e.target.closest('.label-delete')) return;
        const newLabel = prompt('구역 제목 수정', el.textContent);
        if (newLabel && newLabel.trim()) el.textContent = newLabel.trim();
    });

    lastRightClick.canvas.appendChild(el);
    ensureCanvasHeight(lastRightClick.canvas);
    updateDeleteButtonsVisibility();
}

// ===== 동적 항목 (논문/자격증/프로그램/프로젝트) =====
function openDynamicItemModal(type) {
    const config = dynamicItemConfig[type];
    if (!config) return;

    document.getElementById('dynamicItemTitle').textContent = config.title;
    const fieldsDiv = document.getElementById('dynamicItemFields');
    fieldsDiv.innerHTML = '';

    config.fields.forEach(f => {
        const label = document.createElement('label');
        label.innerHTML = `${f.label}: <input type="${f.type}" data-field="${f.name}" placeholder="${f.label} 입력">`;
        fieldsDiv.appendChild(label);
    });

    // 프로젝트는 이미지(URL/파일)를 추가로 받을 수 있게 확장
    if (type === 'project') {
        const imageLabel = document.createElement('label');
        imageLabel.innerHTML = `이미지 URL (선택): <input type="text" data-field="__projectImageUrl" placeholder="https://...">`;
        fieldsDiv.appendChild(imageLabel);

        const fileLabel = document.createElement('label');
        fileLabel.innerHTML = `이미지 파일 (선택): <input type="file" accept="image/*" data-field="__projectImageFile">`;
        fieldsDiv.appendChild(fileLabel);
    }

    document.getElementById('dynamicItemModal').classList.remove('hidden');

    document.getElementById('dynamicItemAdd').onclick = async () => {
        const values = {};
        config.fields.forEach(f => {
            const input = fieldsDiv.querySelector(`[data-field="${f.name}"]`);
            values[f.name] = input?.value?.trim() || '';
        });

        let imageSrc = '';
        if (type === 'project') {
            const urlInput = fieldsDiv.querySelector(`[data-field="__projectImageUrl"]`);
            const fileInput = fieldsDiv.querySelector(`[data-field="__projectImageFile"]`);
            const url = urlInput?.value?.trim() || '';
            const file = fileInput?.files?.[0] || null;

            if (file) {
                try {
                    imageSrc = await readFileAsDataURL(file);
                } catch {
                    imageSrc = '';
                }
            } else if (url) {
                imageSrc = url;
            }
        }

        addDynamicItem(type, values, { imageSrc });
        document.getElementById('dynamicItemModal').classList.add('hidden');
    };
}

function addDynamicItem(type, values, { imageSrc = '' } = {}) {
    if (!lastRightClick.canvas) return;

    const config = dynamicItemConfig[type];
    const pos = getCanvasPosition(lastRightClick.canvas, lastRightClick.x, lastRightClick.y);

    const item = document.createElement('div');
    item.className = `dynamic-item draggable-item`;
    item.dataset.id = type + '_' + Date.now();
    item.dataset.type = type;
    item.dataset.pageId = lastRightClick.pageId;
    item.style.left = pos.left + 'px';
    item.style.top = pos.top + 'px';

    let html = '<div class="item-content">';
    Object.entries(values).forEach(([key, val]) => {
        if (val) html += `<span><strong>${config.fields.find(f => f.name === key)?.label}:</strong> ${escapeHtml(val)}</span><br>`;
    });
    html += '</div><button class="item-delete" aria-label="삭제">×</button>';
    item.innerHTML = html;

    item.querySelector('.item-delete')?.addEventListener('click', () => item.remove());

    if (type === 'project' && imageSrc) {
        item.dataset.imageSrc = imageSrc;
        item.classList.add('project-has-image');
        attachProjectHoverPreview(item);
    }
    lastRightClick.canvas.appendChild(item);
    ensureCanvasHeight(lastRightClick.canvas);
    updateDeleteButtonsVisibility();
}

// ===== 검색 =====
function openSearchModal() {
    document.getElementById('searchModal').classList.remove('hidden');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

function executeSearch() {
    const query = document.getElementById('searchInput').value.trim().toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '';

    if (!query) return;

    const items = [];
    document.querySelectorAll('.content-box, .dynamic-item, .table-wrapper, .section-label, .image-item').forEach(el => {
        const text = el.textContent || '';
        if (text.toLowerCase().includes(query)) items.push({ el, text });
    });

    if (items.length === 0) {
        resultsDiv.innerHTML = '<p>검색 결과가 없습니다.</p>';
        return;
    }

    items.forEach(({ el, text }) => {
        const div = document.createElement('div');
        div.className = 'search-result-item';
        div.textContent = text.substring(0, 80) + (text.length > 80 ? '...' : '');
        div.onclick = () => {
            el.scrollIntoView({ behavior: 'smooth' });
            el.classList.add('highlight');
            setTimeout(() => el.classList.remove('highlight'), 2000);
        };
        resultsDiv.appendChild(div);
    });
}

// ===== 모달 =====
function initModals() {
    document.getElementById('contentBoxAdd')?.addEventListener('click', addContentBox);
    document.getElementById('contentBoxCancel')?.addEventListener('click', () => document.getElementById('contentBoxModal').classList.add('hidden'));

    document.getElementById('tableAdd')?.addEventListener('click', addTable);
    document.getElementById('tableCancel')?.addEventListener('click', () => document.getElementById('tableModal').classList.add('hidden'));

    document.getElementById('searchExecute')?.addEventListener('click', executeSearch);
    document.getElementById('searchInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') executeSearch(); });
    document.getElementById('searchClose')?.addEventListener('click', () => document.getElementById('searchModal').classList.add('hidden'));

    document.getElementById('dynamicItemCancel')?.addEventListener('click', () => document.getElementById('dynamicItemModal').classList.add('hidden'));

    document.getElementById('imageAdd')?.addEventListener('click', addImage);
    document.getElementById('imageCancel')?.addEventListener('click', () => document.getElementById('imageModal').classList.add('hidden'));
    document.getElementById('imageFile')?.addEventListener('change', (e) => {
        const name = e.target.files[0]?.name || '';
        document.getElementById('imageFileName').textContent = name ? `선택: ${name}` : '';
    });

    document.getElementById('exportPublishBtn')?.addEventListener('click', () => {
        if (!isEditSession()) return;
        exportPublishedDataJs();
    });
}

function downloadText(filename, text) {
    const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportPublishedDataJs() {
    const data = collectAllData();
    const js = `// AUTO-GENERATED: 배포용 고정 데이터\nwindow.${PUBLISHED_DATA_GLOBAL} = ${JSON.stringify(data)};\n`;
    downloadText('published_data.js', js);
}

function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('file read error'));
        reader.onload = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(file);
    });
}

// ===== 프로젝트 Hover 이미지 미리보기 =====
let projectHoverPreviewEl = null;
let projectHoverPreviewImg = null;

function initProjectHoverPreview() {
    if (projectHoverPreviewEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'project-hover-preview hidden';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `<img alt="프로젝트 미리보기">`;
    document.body.appendChild(wrap);
    projectHoverPreviewEl = wrap;
    projectHoverPreviewImg = wrap.querySelector('img');
}

function attachProjectHoverPreview(itemEl) {
    if (!itemEl || itemEl.dataset.type !== 'project') return;
    const src = itemEl.dataset.imageSrc || '';
    if (!src) return;
    if (itemEl.dataset.previewBound === '1') return;
    itemEl.dataset.previewBound = '1';

    const show = () => {
        if (!projectHoverPreviewEl || !projectHoverPreviewImg) return;
        projectHoverPreviewImg.src = src;
        projectHoverPreviewEl.classList.remove('hidden');
    };

    const hide = () => {
        projectHoverPreviewEl?.classList.add('hidden');
        if (projectHoverPreviewImg) projectHoverPreviewImg.src = '';
    };

    const move = (e) => {
        if (!projectHoverPreviewEl || projectHoverPreviewEl.classList.contains('hidden')) return;
        const pad = 14;
        const offsetX = 18;
        const offsetY = 18;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const rect = projectHoverPreviewEl.getBoundingClientRect();

        let x = e.clientX + offsetX;
        let y = e.clientY + offsetY;

        if (x + rect.width + pad > vw) x = e.clientX - rect.width - offsetX;
        if (y + rect.height + pad > vh) y = e.clientY - rect.height - offsetY;

        projectHoverPreviewEl.style.left = `${Math.max(pad, Math.min(vw - rect.width - pad, x))}px`;
        projectHoverPreviewEl.style.top = `${Math.max(pad, Math.min(vh - rect.height - pad, y))}px`;
    };

    itemEl.addEventListener('mouseenter', show);
    itemEl.addEventListener('mouseleave', hide);
    itemEl.addEventListener('mousemove', move);
}

function collectAllData() {
    const data = { items: [] };

    document.querySelectorAll('.draggable-item').forEach(el => {
        const item = {
            id: el.dataset.id,
            type: el.dataset.type,
            pageId: el.dataset.pageId,
            left: parseFloat(el.style.left) || 0,
            top: parseFloat(el.style.top) || 0
        };

        if (el.dataset.type === 'contentBox') {
            const text = el.querySelector('.box-text')?.innerHTML || '';
            const tags = el.querySelector('.box-tags')?.textContent || '';
            const img = el.querySelector('img');
            item.color = el.className.match(/yellow|blue|green/)?.[0] || 'yellow';
            item.text = text;
            item.tags = tags;
            item.imageUrl = img?.src || '';
        } else if (el.dataset.type === 'table') {
            const table = el.querySelector('table');
            if (table) {
                const rows = [];
                table.querySelectorAll('tr').forEach(tr => {
                    const cells = [];
                    tr.querySelectorAll('th, td').forEach(cell => cells.push(cell.textContent));
                    rows.push(cells);
                });
                item.rows = rows;
            }
        } else if (el.dataset.type === 'sectionLabel') {
            item.label = el.querySelector('.label-text')?.textContent || el.textContent || '';
        } else if (el.dataset.type === 'image') {
            const img = el.querySelector('img');
            item.src = img?.src || '';
        } else if (el.dataset.type === 'project') {
            const config = dynamicItemConfig[el.dataset.type];
            if (config) {
                const content = el.querySelector('.item-content');
                config.fields.forEach(f => {
                    const spans = content?.querySelectorAll('span') || [];
                    const s = Array.from(spans).find(x => x.textContent.includes(f.label));
                    if (s) item[f.name] = s.textContent.replace(s.querySelector('strong')?.textContent || '', '').trim();
                });
            }
            item.imageSrc = el.dataset.imageSrc || '';
        } else {
            const config = dynamicItemConfig[el.dataset.type];
            if (config) {
                const content = el.querySelector('.item-content');
                config.fields.forEach(f => {
                    const spans = content?.querySelectorAll('span') || [];
                    const s = Array.from(spans).find(x => x.textContent.includes(f.label));
                    if (s) item[f.name] = s.textContent.replace(s.querySelector('strong')?.textContent || '', '').trim();
                });
            }
        }
        data.items.push(item);
    });

    return data;
}

// ===== 저장/로드 =====
function saveAllData() {
    const data = collectAllData();

    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
        console.warn('저장 실패:', e);
    }
}

function loadPublishedData() {
    const published = window[PUBLISHED_DATA_GLOBAL];
    if (!published || typeof published !== 'object') return false;
    if (!Array.isArray(published.items)) return false;

    try {
        // 기존 동적 아이템 제거 후 복원
        document.querySelectorAll('.draggable-item').forEach(el => el.remove());
        (published.items || []).forEach(item => restoreItem(item));
        document.querySelectorAll('.canvas-area').forEach(ensureCanvasHeight);
        return true;
    } catch (e) {
        console.warn('published data 로드 실패:', e);
        return false;
    }
}

function loadSavedData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const data = JSON.parse(raw);
        (data.items || []).forEach(item => restoreItem(item));

        document.querySelectorAll('.canvas-area').forEach(ensureCanvasHeight);
    } catch (e) {
        console.warn('로드 실패:', e);
    }
}

function restoreItem(item) {
    const canvas = document.getElementById('canvas-' + item.pageId);
    if (!canvas) return;

    if (item.type === 'contentBox') {
        const box = document.createElement('div');
        box.className = `content-box draggable-item ${item.color || 'yellow'}`;
        box.dataset.id = item.id;
        box.dataset.type = 'contentBox';
        box.dataset.pageId = item.pageId;
        box.style.left = (item.left || 0) + 'px';
        box.style.top = (item.top || 0) + 'px';

        let html = '';
        if (item.text) html += `<div class="box-text">${item.text}</div>`;
        if (item.imageUrl) html += `<img src="${item.imageUrl}" alt="이미지">`;
        if (item.tags) html += `<div class="box-tags">${item.tags}</div>`;
        box.innerHTML = html + '<button class="box-delete" aria-label="삭제">×</button>';
        box.querySelector('.box-delete')?.addEventListener('click', (e) => { e.stopPropagation(); box.remove(); });
        canvas.appendChild(box);
    } else if (item.type === 'table') {
        const wrapper = document.createElement('div');
        wrapper.className = 'table-wrapper draggable-item';
        wrapper.dataset.id = item.id;
        wrapper.dataset.type = 'table';
        wrapper.dataset.pageId = item.pageId;
        wrapper.style.left = (item.left || 0) + 'px';
        wrapper.style.top = (item.top || 0) + 'px';

        const rows = item.rows || [];
        let tableHtml = '<table class="data-table">';
        rows.forEach((row, ri) => {
            if (ri === 0) tableHtml += '<thead><tr>';
            else if (ri === 1) tableHtml += '</thead><tbody><tr>';
            else tableHtml += '<tr>';
            (row || []).forEach(cell => {
                const tag = ri === 0 ? 'th' : 'td';
                tableHtml += `<${tag} contenteditable="true">${escapeHtml(cell)}</${tag}>`;
            });
            tableHtml += '</tr>';
        });
        if (rows.length) tableHtml += '</tbody>';
        tableHtml += '</table><div class="table-drag-handle" title="드래그하여 이동">⋮⋮</div><button class="table-delete">표 삭제</button>';
        wrapper.innerHTML = tableHtml;
        wrapper.querySelector('.table-delete')?.addEventListener('click', () => wrapper.remove());
        canvas.appendChild(wrapper);
    } else if (item.type === 'sectionLabel') {
        const el = document.createElement('div');
        el.className = 'section-label draggable-item';
        el.dataset.id = item.id;
        el.dataset.type = 'sectionLabel';
        el.dataset.pageId = item.pageId;
        el.style.left = (item.left || 0) + 'px';
        el.style.top = (item.top || 0) + 'px';
        el.innerHTML = `<span class="label-text">${escapeHtml(item.label || '구역')}</span><button class="label-delete" aria-label="삭제">×</button>`;
        el.querySelector('.label-delete')?.addEventListener('click', (e) => { e.stopPropagation(); el.remove(); });
        el.addEventListener('dblclick', (e) => {
            if (e.target.closest('.label-delete')) return;
            const txt = el.querySelector('.label-text');
            const newLabel = prompt('구역 제목 수정', txt?.textContent || '');
            if (newLabel && newLabel.trim()) { if (txt) txt.textContent = newLabel.trim(); }
        });
        canvas.appendChild(el);
    } else if (item.type === 'image') {
        const wrapper = document.createElement('div');
        wrapper.className = 'image-item draggable-item';
        wrapper.dataset.id = item.id;
        wrapper.dataset.type = 'image';
        wrapper.dataset.pageId = item.pageId;
        wrapper.style.left = (item.left || 0) + 'px';
        wrapper.style.top = (item.top || 0) + 'px';

        const img = document.createElement('img');
        img.src = item.src || '';
        img.alt = '이미지';
        img.draggable = false;
        wrapper.appendChild(img);
        const delBtn = document.createElement('button');
        delBtn.className = 'image-delete';
        delBtn.setAttribute('aria-label', '삭제');
        delBtn.textContent = '×';
        wrapper.appendChild(delBtn);

        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            wrapper.remove();
        });
        canvas.appendChild(wrapper);
    } else {
        const config = dynamicItemConfig[item.type];
        if (!config) return;

        const values = {};
        config.fields.forEach(f => { values[f.name] = item[f.name] || ''; });

        const el = document.createElement('div');
        el.className = 'dynamic-item draggable-item';
        el.dataset.id = item.id;
        el.dataset.type = item.type;
        el.dataset.pageId = item.pageId;
        el.style.left = (item.left || 0) + 'px';
        el.style.top = (item.top || 0) + 'px';

        let html = '<div class="item-content">';
        config.fields.forEach(f => {
            const val = values[f.name];
            if (val) html += `<span><strong>${f.label}:</strong> ${escapeHtml(val)}</span><br>`;
        });
        html += '</div><button class="item-delete" aria-label="삭제">×</button>';
        el.innerHTML = html;
        el.querySelector('.item-delete')?.addEventListener('click', () => el.remove());

        if (item.type === 'project' && item.imageSrc) {
            el.dataset.imageSrc = item.imageSrc;
            el.classList.add('project-has-image');
            attachProjectHoverPreview(el);
        }
        canvas.appendChild(el);
    }
}

// 캔버스 높이 확보 (아이템이 공간을 차지하도록)
function ensureCanvasHeight(canvas) {
    let maxBottom = 0;
    canvas.querySelectorAll('.draggable-item').forEach(el => {
        const top = parseFloat(el.style.top) || 0;
        const h = el.offsetHeight;
        maxBottom = Math.max(maxBottom, top + h);
    });
    if (maxBottom > 0) {
        canvas.style.minHeight = Math.max(500, maxBottom + 40) + 'px';
    }
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ===== GitHub 페이지 =====
function initGithubPage() {
    const input = document.getElementById('githubUsername');
    if (!input) return;

    const refreshBtn = document.getElementById('githubRefreshBtn');

    input.value = GITHUB_DEFAULT_USERNAME;

    const run = async (force = false) => {
        await loadAndRenderGithub(GITHUB_DEFAULT_USERNAME, { force });
    };

    refreshBtn?.addEventListener('click', () => run(true));
    run(false);
}

function readGithubSettings() {
    try {
        const raw = localStorage.getItem(GITHUB_SETTINGS_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function writeGithubSettings(settings) {
    try {
        localStorage.setItem(GITHUB_SETTINGS_KEY, JSON.stringify(settings || {}));
    } catch {
        // ignore
    }
}

function readGithubCache() {
    try {
        const raw = localStorage.getItem(GITHUB_CACHE_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

function writeGithubCache(cache) {
    try {
        localStorage.setItem(GITHUB_CACHE_KEY, JSON.stringify(cache || {}));
    } catch {
        // ignore
    }
}

function setGithubStatus(message, tone = 'info') {
    const el = document.getElementById('githubStatus');
    if (!el) return;
    el.textContent = message || '';
    el.dataset.tone = tone;
}

function setGithubLoading(isLoading) {
    const page = document.getElementById('page-github');
    if (!page) return;
    page.classList.toggle('github-loading', !!isLoading);
}

function renderGithubPlaceholder() {
    const profile = document.getElementById('githubProfileBody');
    const repos = document.getElementById('githubReposBody');
    const act = document.getElementById('githubActivityBody');
    if (profile) profile.innerHTML = '<p class="github-placeholder">불러오는 중...</p>';
    if (repos) repos.innerHTML = '<p class="github-placeholder">불러오는 중...</p>';
    if (act) act.innerHTML = '<p class="github-placeholder">불러오는 중...</p>';
}

async function loadAndRenderGithub(username, { force = false } = {}) {
    const now = Date.now();
    const cache = readGithubCache();
    const cached = cache[username];
    const isFresh = cached && typeof cached === 'object' && (now - (cached.fetchedAt || 0) < GITHUB_CACHE_TTL_MS);

    if (!force && isFresh && cached.profile && cached.repos && cached.events) {
        renderGithubAll({ username, profile: cached.profile, repos: cached.repos, events: cached.events, fetchedAt: cached.fetchedAt });
        setGithubStatus(`캐시된 데이터 표시 중 · ${formatRelativeTime(cached.fetchedAt)} 업데이트`, 'muted');
        return;
    }

    setGithubLoading(true);
    renderGithubPlaceholder();
    setGithubStatus('GitHub 데이터를 불러오는 중...', 'info');

    try {
        const [profile, repos, events] = await Promise.all([
            fetchGithubJson(`https://api.github.com/users/${encodeURIComponent(username)}`),
            fetchGithubJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=pushed`),
            fetchGithubJson(`https://api.github.com/users/${encodeURIComponent(username)}/events/public?per_page=20`)
        ]);

        cache[username] = { fetchedAt: Date.now(), profile, repos, events };
        writeGithubCache(cache);

        renderGithubAll({ username, profile, repos, events, fetchedAt: cache[username].fetchedAt });
        setGithubStatus(`업데이트 완료 · ${formatRelativeTime(cache[username].fetchedAt)}`, 'success');
    } catch (err) {
        const msg = (err && err.message) ? err.message : '불러오기에 실패했습니다.';

        if (cached && cached.profile && cached.repos && cached.events) {
            renderGithubAll({ username, profile: cached.profile, repos: cached.repos, events: cached.events, fetchedAt: cached.fetchedAt });
            setGithubStatus(`API 실패로 캐시 표시 · ${msg}`, 'warn');
        } else {
            renderGithubError(msg);
            setGithubStatus(msg, 'error');
        }
    } finally {
        setGithubLoading(false);
    }
}

async function fetchGithubJson(url) {
    const res = await fetch(url, {
        headers: {
            'Accept': 'application/vnd.github+json'
        }
    });

    if (!res.ok) {
        const reset = res.headers.get('x-ratelimit-reset');
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (res.status === 404) throw new Error('사용자를 찾을 수 없습니다. (404)');
        if (res.status === 403 && remaining === '0') {
            const resetMs = reset ? (parseInt(reset, 10) * 1000) : null;
            const when = resetMs ? new Date(resetMs).toLocaleTimeString('ko-KR') : '잠시 후';
            throw new Error(`GitHub API 호출 제한에 걸렸습니다. ${when} 이후 다시 시도해주세요.`);
        }
        throw new Error(`GitHub API 요청 실패 (${res.status})`);
    }
    return await res.json();
}

function renderGithubError(message) {
    const profile = document.getElementById('githubProfileBody');
    const repos = document.getElementById('githubReposBody');
    const act = document.getElementById('githubActivityBody');
    const html = `<div class="github-error"><strong>불러오기 실패</strong><p>${escapeHtml(message || '')}</p></div>`;
    if (profile) profile.innerHTML = html;
    if (repos) repos.innerHTML = html;
    if (act) act.innerHTML = html;
}

function renderGithubAll({ username, profile, repos, events, fetchedAt }) {
    renderGithubProfile(username, profile);
    renderGithubRepos(repos, fetchedAt);
    renderGithubActivity(events, fetchedAt);
}

function renderGithubProfile(username, profile) {
    const body = document.getElementById('githubProfileBody');
    const link = document.getElementById('githubProfileLink');
    if (!body) return;

    const htmlUrl = profile?.html_url || `https://github.com/${encodeURIComponent(username)}`;
    if (link) link.href = htmlUrl;

    const name = profile?.name || profile?.login || username;
    const bio = profile?.bio || '소개가 없습니다.';
    const avatar = profile?.avatar_url || '';
    const location = profile?.location || '';
    const company = profile?.company || '';
    const blog = profile?.blog || '';

    const metaParts = [];
    if (company) metaParts.push(escapeHtml(company));
    if (location) metaParts.push(escapeHtml(location));

    body.innerHTML = `
        <div class="github-profile">
            <div class="github-avatar-wrap">
                ${avatar ? `<img class="github-avatar" src="${avatar}" alt="GitHub 아바타" loading="lazy">` : ''}
            </div>
            <div class="github-profile-main">
                <div class="github-profile-title">
                    <div class="github-profile-name">${escapeHtml(name)}</div>
                    <div class="github-profile-login">@${escapeHtml(profile?.login || username)}</div>
                </div>
                <div class="github-profile-bio">${escapeHtml(bio)}</div>
                ${metaParts.length ? `<div class="github-profile-meta">${metaParts.join(' · ')}</div>` : ''}
                <div class="github-profile-stats">
                    <span><strong>${profile?.public_repos ?? '-'}</strong> Repos</span>
                    <span><strong>${profile?.followers ?? '-'}</strong> Followers</span>
                    <span><strong>${profile?.following ?? '-'}</strong> Following</span>
                </div>
                ${blog ? `<div class="github-profile-blog"><a class="github-link" href="${escapeHtml(blog)}" target="_blank" rel="noreferrer">${escapeHtml(blog)}</a></div>` : ''}
            </div>
        </div>
    `;
}

function renderGithubRepos(repos, fetchedAt) {
    const body = document.getElementById('githubReposBody');
    const meta = document.getElementById('githubRepoMeta');
    if (!body) return;

    const list = Array.isArray(repos) ? repos.filter(r => r && !r.fork) : [];
    const sorted = list.slice().sort((a, b) => (new Date(b.pushed_at).getTime() || 0) - (new Date(a.pushed_at).getTime() || 0));
    const top = sorted.slice(0, 8);

    if (meta) meta.textContent = `${top.length}개 표시 · ${formatRelativeTime(fetchedAt)} 업데이트`;

    if (top.length === 0) {
        body.innerHTML = '<p class="github-placeholder">표시할 레포가 없습니다.</p>';
        return;
    }

    body.innerHTML = `
        <div class="github-repo-list">
            ${top.map(repo => {
                const name = repo?.name || '';
                const full = repo?.full_name || name;
                const desc = repo?.description || '';
                const lang = repo?.language || '';
                const stars = repo?.stargazers_count ?? 0;
                const url = repo?.html_url || '#';
                const pushed = repo?.pushed_at ? formatRelativeTime(repo.pushed_at) : '';

                return `
                    <a class="github-repo" href="${url}" target="_blank" rel="noreferrer">
                        <div class="github-repo-top">
                            <div class="github-repo-name">${escapeHtml(full)}</div>
                            <div class="github-repo-badges">
                                ${lang ? `<span class="github-badge">${escapeHtml(lang)}</span>` : ''}
                                <span class="github-badge">★ ${stars}</span>
                            </div>
                        </div>
                        ${desc ? `<div class="github-repo-desc">${escapeHtml(desc)}</div>` : ''}
                        ${pushed ? `<div class="github-repo-meta">마지막 푸시 · ${escapeHtml(pushed)}</div>` : ''}
                    </a>
                `;
            }).join('')}
        </div>
    `;
}

function renderGithubActivity(events, fetchedAt) {
    const body = document.getElementById('githubActivityBody');
    const meta = document.getElementById('githubActivityMeta');
    if (!body) return;

    const list = Array.isArray(events) ? events.slice(0, 12) : [];
    if (meta) meta.textContent = `${list.length}개 표시 · ${formatRelativeTime(fetchedAt)} 업데이트`;

    if (list.length === 0) {
        body.innerHTML = '<p class="github-placeholder">최근 활동이 없거나 GitHub에서 제공되지 않습니다.</p>';
        return;
    }

    body.innerHTML = `
        <ul class="github-activity">
            ${list.map(ev => {
                const repo = ev?.repo?.name || '';
                const repoUrl = repo ? `https://github.com/${repo}` : '#';
                const when = ev?.created_at ? formatRelativeTime(ev.created_at) : '';
                const summary = summarizeGithubEvent(ev);

                return `
                    <li class="github-activity-item">
                        <a class="github-activity-link" href="${repoUrl}" target="_blank" rel="noreferrer">
                            <span class="github-activity-summary">${escapeHtml(summary)}</span>
                            <span class="github-activity-meta">${escapeHtml(when)}</span>
                        </a>
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

function summarizeGithubEvent(ev) {
    const type = ev?.type || '';
    const repo = ev?.repo?.name || '';
    const payload = ev?.payload || {};

    if (type === 'PushEvent') {
        const n = Array.isArray(payload.commits) ? payload.commits.length : 0;
        return `${repo}에 커밋 ${n}개 푸시`;
    }
    if (type === 'PullRequestEvent') {
        const action = payload.action || '업데이트';
        const title = payload.pull_request?.title || '';
        return `${repo} PR ${action}${title ? ` · ${title}` : ''}`;
    }
    if (type === 'IssuesEvent') {
        const action = payload.action || '업데이트';
        const title = payload.issue?.title || '';
        return `${repo} Issue ${action}${title ? ` · ${title}` : ''}`;
    }
    if (type === 'CreateEvent') {
        const refType = payload.ref_type || '항목';
        const ref = payload.ref ? `(${payload.ref})` : '';
        return `${repo}에 ${refType} 생성 ${ref}`.trim();
    }
    if (type === 'WatchEvent') {
        return `${repo} Star`;
    }
    return `${repo} · ${type}`.trim();
}

function formatRelativeTime(input) {
    const t = (input instanceof Date) ? input.getTime() : new Date(input).getTime();
    if (!t || Number.isNaN(t)) return '';

    const diff = Date.now() - t;
    const sec = Math.floor(diff / 1000);
    if (sec < 10) return '방금 전';
    if (sec < 60) return `${sec}초 전`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}분 전`;
    const hour = Math.floor(min / 60);
    if (hour < 24) return `${hour}시간 전`;
    const day = Math.floor(hour / 24);
    if (day < 14) return `${day}일 전`;
    return new Date(t).toLocaleDateString('ko-KR');
}
