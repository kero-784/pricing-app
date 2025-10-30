document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIG & STATE ---
    const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxSa_BLTjDcaTbA9-pLGrE7BTAJzuw9uxIeqYLEpANfSFWbsqilvMuNlJS2FkBFALp4/exec';
    const state = { 
        allItems: [], 
        selectedItemIds: new Set(), 
        printQueue: [], 
        visibleItemIds: [], 
        activePriceCategory: null,
        allBranchCategories: [] // NEW: To store the branch mapping
    };
    
    // --- DOM ELEMENTS ---
    const dom = {
        setupModal: document.getElementById('setup-modal-overlay'),
        setupTitle: document.getElementById('setup-title'),
        setupMessage: document.getElementById('setup-message'),
        setupButtons: document.getElementById('setup-buttons-container'),
        appContainer: document.querySelector('.app-container'),
        appStatus: document.getElementById('app-status'),
        itemSelectionSection: document.getElementById('item-selection-section'),
        selectionSummary: document.getElementById('selection-summary'),
        stagingSection: document.getElementById('staging-section'),
        activeCategoryDisplay: document.getElementById('active-category-display'),
        stagingList: document.getElementById('staging-list'),
        printQueueSection: document.getElementById('print-queue-section'),
        printQueueList: document.getElementById('print-queue-list'),
        queueSummary: document.getElementById('queue-summary'),
        a4Sheet: document.getElementById('a4-sheet'),
        printButton: document.getElementById('print-button'),
        layoutStatus: document.getElementById('layout-calculation-status'),
        modal: document.getElementById('item-selection-modal'),
        openModalBtn: document.getElementById('open-item-modal-btn'),
        accordionHeader: document.getElementById('accordion-header'),
        controls: { itemFontSize: document.getElementById('item-font-size'), priceFontSize: document.getElementById('price-font-size') }
    };
    
    // Inject Modal HTML and get references
    dom.modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header"><h2>اختر الأصناف</h2><button class="modal-close-btn" title="إغلاق">&times;</button></div>
            <div class="modal-body">
                <div class="search-header"><div id="search-container"><select id="search-field"><option value="name">الاسم</option><option value="code">الكود</option></select><input type="search" id="search-input" placeholder="اكتب هنا للبحث..."></div><button id="select-all-btn" class="btn-link">تحديد الكل</button></div>
                <div id="item-list"></div>
            </div>
            <div class="modal-footer"><span id="modal-selection-count">0 صنف محدد</span><button id="confirm-selection-btn" disabled>تأكيد الإختيار</button></div>
        </div>`;
    Object.assign(dom, {
        searchInput: document.getElementById('search-input'),
        searchField: document.getElementById('search-field'),
        itemList: document.getElementById('item-list'),
        modalSelectionCount: document.getElementById('modal-selection-count'),
        confirmSelectionBtn: document.getElementById('confirm-selection-btn'),
        selectAllBtn: document.getElementById('select-all-btn')
    });
    
    // --- UTILITY FUNCTIONS ---
    const debounce = (f, d) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f.apply(this, a), d); }; };
    
    const showStatus = (message, type = 'error', persistent = false) => {
        const icon = type === 'success' ? '✔️' : '❌';
        dom.appStatus.innerHTML = `<span class="icon">${icon}</span> ${message}`;
        dom.appStatus.className = `app-status ${type}`;
        dom.appStatus.style.display = 'flex';
        if (!persistent) {
            setTimeout(() => { dom.appStatus.style.display = 'none'; }, 4000);
        }
    };

    const openModal = () => { dom.modal.classList.add('is-visible'); setTimeout(() => dom.searchInput.focus(), 50); };
    const closeModal = () => { dom.modal.classList.remove('is-visible'); };
    
    // --- CORE APP LOGIC (Rendering, State Management) ---
    // These functions are mostly unchanged, just moved here for organization.
    const updateModalUI = () => {
        const count = state.selectedItemIds.size;
        dom.modalSelectionCount.textContent = `${count} صنف محدد`;
        dom.confirmSelectionBtn.disabled = count === 0;
        const allVisibleSelected = state.visibleItemIds.length > 0 && state.visibleItemIds.every(id => state.selectedItemIds.has(id));
        dom.selectAllBtn.textContent = allVisibleSelected ? 'إلغاء تحديد الكل' : 'تحديد الكل';
        dom.selectAllBtn.onclick = allVisibleSelected ? handleDeselectAll : handleSelectAll;
    };
    
    const renderItems = (items) => {
        state.visibleItemIds = items.map(i => i.id);
        dom.itemList.innerHTML = items.length === 0 ? '<p style="text-align:center; padding: 20px; color: var(--muted-text);">لا توجد نتائج</p>' : '';
        const f = document.createDocumentFragment();
        items.forEach(item => {
            const isSelected = state.selectedItemIds.has(item.id);
            const card = document.createElement('div');
            card.className = `item-card ${isSelected ? 'selected' : ''}`;
            card.dataset.id = item.id;
            card.innerHTML = `<span class="item-name" title="${item.name}">${item.name}</span><span class="item-meta">الكود: ${item.code || 'N/A'}</span>`;
            card.addEventListener('click', () => {
                const id = parseInt(card.dataset.id, 10);
                if (state.selectedItemIds.has(id)) { state.selectedItemIds.delete(id); } else { state.selectedItemIds.add(id); }
                card.classList.toggle('selected');
                updateModalUI();
            });
            f.appendChild(card);
        });
        dom.itemList.appendChild(f);
        updateModalUI();
    };

    const handleSearch = () => {
        const q = dom.searchInput.value.toLowerCase().trim(), f = dom.searchField.value;
        const filtered = q ? state.allItems.filter(i => String(i[f] || '').toLowerCase().includes(q)) : state.allItems;
        renderItems(filtered);
    };
    
    const renderPrintQueue = () => {
        dom.printQueueList.innerHTML = '';
        if (state.printQueue.length === 0) { dom.printQueueSection.style.display = 'none'; dom.queueSummary.style.display = 'none'; return; }
        dom.printQueueSection.style.display = 'block';
        const f = document.createDocumentFragment();
        state.printQueue.forEach(job => {
            const el = document.createElement('div'); el.className = 'queue-item';
            el.innerHTML = `<div class="queue-item-details"><span class="queue-item-name" title="${job.name}">${job.name}</span><span class="queue-item-meta">السعر: ${job.price.toFixed(2)} - الكمية: ${job.quantity}</span></div><button class="queue-item-remove" data-id="${job.id}" title="إزالة">&times;</button>`;
            f.appendChild(el);
        });
        dom.printQueueList.appendChild(f);
        const total = state.printQueue.reduce((s, j) => s + parseInt(j.quantity), 0);
        dom.queueSummary.textContent = `الإجمالي: ${total} بطاقة`; dom.queueSummary.style.display = 'block';
    };

    const updatePreview = () => {
        const r = document.documentElement.style;
        r.setProperty('--label-item-font-size', `${dom.controls.itemFontSize.value}px`); r.setProperty('--label-price-font-size', `${dom.controls.priceFontSize.value}px`);
        const PAGE_HEIGHT_MM = 297, MARGIN_MM = 10, PRINTABLE_HEIGHT = PAGE_HEIGHT_MM - (MARGIN_MM * 2);
        const labelHeight = 30, gap = 5;
        const labelsPerPage = Math.floor((PRINTABLE_HEIGHT + gap) / (labelHeight + gap));
        dom.a4Sheet.innerHTML = ''; dom.a4Sheet.style.gridTemplateColumns = `1fr`; dom.a4Sheet.style.gap = `${gap}mm`; dom.a4Sheet.style.gridTemplateRows = `repeat(${labelsPerPage}, ${labelHeight}mm)`;
        const labelsToRender = state.printQueue.flatMap(job => Array(parseInt(job.quantity)).fill(job));
        const f = document.createDocumentFragment();
        labelsToRender.forEach(job => {
            const l = document.createElement('div'); l.className = 'price-label';
            l.innerHTML = `<div class="label-logo-area"></div><div class="label-info-area">${job.name}</div><div class="label-price-area"><div class="label-price-container"><div class="label-price">${job.price.toFixed(2)} ج.م</div></div></div>`;
            f.appendChild(l);
        });
        dom.a4Sheet.appendChild(f);
        dom.a4Sheet.querySelectorAll('.price-label .label-info-area').forEach(iA => {
            iA.style.fontSize = ''; let fs = parseInt(window.getComputedStyle(iA).fontSize);
            while (iA.scrollWidth > iA.clientWidth && fs > 8) { fs--; iA.style.fontSize = `${fs}px`; }
        });
        const total = state.printQueue.reduce((s, j) => s + parseInt(j.quantity), 0);
        dom.layoutStatus.textContent = `سعة الصفحة: ${labelsPerPage} بطاقات | القائمة: ${total} بطاقة`; dom.layoutStatus.style.display = 'block';
        dom.printButton.style.display = labelsToRender.length > 0 ? 'inline-flex' : 'none';
    };

    const renderStagingList = () => {
        dom.stagingList.innerHTML = '';
        if (state.selectedItemIds.size === 0) {
            dom.stagingSection.style.display = 'none';
            dom.selectionSummary.textContent = 'لم يتم تحديد أي صنف.'; return;
        }
        dom.selectionSummary.textContent = `${state.selectedItemIds.size} أصناف جاهزة للتجهيز.`;
        dom.stagingSection.style.display = 'block';
        const f = document.createDocumentFragment();
        state.selectedItemIds.forEach(id => {
            const item = state.allItems.find(i => i.id === id); if (!item) return;
            const card = document.createElement('div'); card.className = 'staging-item'; card.dataset.id = id;
            const price = (item.prices[state.activePriceCategory] || 0).toFixed(2);
            card.innerHTML = `<div class="staging-item-header"><div class="staging-item-details"><div class="item-name">${item.name}</div><div class="item-meta">الكود: ${item.code || 'N/A'}</div></div><button class="staging-item-remove-btn" title="إزالة">&times;</button></div><div class="staging-item-controls"><input type="number" class="staging-price" placeholder="السعر" step="0.01" min="0" value="${price}"><input type="number" class="staging-quantity" value="1" placeholder="الكمية" min="1"><button class="staging-add-btn">إضافة</button></div>`;
            f.appendChild(card);
        });
        dom.stagingList.appendChild(f);
    };

    // --- EVENT HANDLERS ---
    const handleSelectAll = () => { state.visibleItemIds.forEach(id => state.selectedItemIds.add(id)); dom.itemList.querySelectorAll('.item-card').forEach(card => card.classList.add('selected')); updateModalUI(); };
    const handleDeselectAll = () => { state.visibleItemIds.forEach(id => state.selectedItemIds.delete(id)); dom.itemList.querySelectorAll('.item-card').forEach(card => card.classList.remove('selected')); updateModalUI(); };
    const handleConfirmSelection = () => { renderStagingList(); closeModal(); };
    const handleStagingListClick = (e) => {
        const t = e.target, card = t.closest('.staging-item'); if (!card) return;
        const id = parseInt(card.dataset.id, 10);
        if (t.classList.contains('staging-item-remove-btn')) { state.selectedItemIds.delete(id); renderStagingList(); }
        if (t.classList.contains('staging-add-btn')) {
            const pI = card.querySelector('.staging-price'), qI = card.querySelector('.staging-quantity');
            const p = parseFloat(pI.value), q = parseInt(qI.value, 10);
            if (isNaN(p) || p <= 0) { showStatus('الرجاء إدخال سعر صحيح.', 'error'); pI.focus(); return; }
            if (isNaN(q) || q < 1) { showStatus('الرجاء إدخال كمية صحيحة.', 'error'); qI.focus(); return; }
            const item = state.allItems.find(i => i.id === id);
            state.printQueue.push({ id: Date.now(), name: item.name, price: p, quantity: q });
            state.selectedItemIds.delete(id);
            renderStagingList(); renderPrintQueue(); updatePreview();
        }
    };
    
    // --- NEW & REFACTORED INITIALIZATION LOGIC ---
    
    const fetchBranchCategories = async () => {
        try {
            const response = await fetch(`${WEB_APP_URL}?action=getBranchCategories`);
            if (!response.ok) throw new Error(`Server Error (${response.status})`);
            const data = await response.json();
            if (data.error) throw new Error(data.message);
            state.allBranchCategories = data;
            return true;
        } catch (error) {
            showStatus(`فشل تحميل فئات الفروع: ${error.message}.`, 'error', true);
            dom.setupMessage.textContent = 'حدث خطأ. لا يمكن متابعة التطبيق.';
            dom.setupButtons.innerHTML = '';
            return false;
        }
    };

    const loadItemData = async () => {
        showStatus('جاري تحميل بيانات الأصناف...', 'success');
        try {
            const response = await fetch(`${WEB_APP_URL}?action=getItems`);
            if (!response.ok) throw new Error(`Server Error (${response.status})`);
            const data = await response.json();
            if (data.error) throw new Error(data.message);
            state.allItems = data.map((item, index) => ({ ...item, id: item.id ?? index }));
            showStatus(`تم تحميل ${state.allItems.length} صنف بنجاح.`, 'success');
            renderItems(state.allItems);
            updatePreview();
        } catch (error) {
            showStatus(`فشل تحميل بيانات الأصناف: ${error.message}.`, 'error');
        }
    };

    const startSession = (category, categoryName) => {
        if (!category) return;
        state.activePriceCategory = category;
        dom.activeCategoryDisplay.innerHTML = `فئة السعر النشطة: <strong>${categoryName}</strong>`;
        dom.setupModal.style.opacity = '0';
        setTimeout(() => {
            dom.setupModal.style.display = 'none';
            dom.appContainer.style.display = 'flex';
        }, 300);
        loadItemData();
    };

    const init = async () => {
        if (!currentUserData) {
            console.error("Authentication failed or is pending, halting app initialization.");
            return;
        }
        
        dom.setupTitle.textContent = 'جاري التحقق من الفرع...';
        dom.setupMessage.textContent = 'الرجاء الانتظار.';
        dom.setupButtons.style.display = 'none';

        const branchesLoaded = await fetchBranchCategories();
        if (!branchesLoaded) return;

        const userBranchCode = currentUserData?.permissions?.AssignedBranchCode;
        console.log("User's assigned branch code:", userBranchCode);

        let branchMapping = null;
        if (userBranchCode) {
            branchMapping = state.allBranchCategories.find(b => 
                String(b.branchCode).trim() === String(userBranchCode).trim()
            );
        }

        if (branchMapping && branchMapping.category) {
            console.log("Found matching category:", branchMapping.category);
            startSession(branchMapping.category.toLowerCase(), branchMapping.branchName);
        } else {
            if (userBranchCode) {
                console.warn(`Assigned branch code '${userBranchCode}' not found or has no category. Falling back to manual selection.`);
            } else {
                console.log("No assigned branch code for user. Showing manual selector.");
            }
            // Fallback to manual selection
            dom.setupTitle.textContent = 'اختر فئة السعر';
            dom.setupMessage.textContent = 'لم يتم تحديد فرعك تلقائياً. الرجاء الاختيار يدوياً.';
            dom.setupButtons.style.display = 'flex';
        }
    };
    
    // --- ATTACH EVENT LISTENERS ---
    const debouncedSearch = debounce(handleSearch, 250);
    const debouncedUpdatePreview = debounce(updatePreview, 250);
    
    // Manual selection handler for fallback
    dom.setupModal.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-category]');
        if (button) {
            startSession(button.dataset.category, button.dataset.name);
        }
    });
    
    dom.openModalBtn.addEventListener('click', openModal);
    dom.modal.addEventListener('click', (e) => { if (e.target.classList.contains('modal-overlay') || e.target.closest('.modal-close-btn')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    dom.confirmSelectionBtn.addEventListener('click', handleConfirmSelection);
    dom.stagingList.addEventListener('click', handleStagingListClick);
    dom.printButton.addEventListener('click', () => window.print());
    dom.printQueueList.addEventListener('click', e => { const b = e.target.closest('.queue-item-remove'); if (b) { const id = parseInt(b.dataset.id, 10); state.printQueue = state.printQueue.filter(j => j.id !== id); renderPrintQueue(); updatePreview(); } });
    dom.searchInput.addEventListener('input', debouncedSearch);
    dom.searchField.addEventListener('change', handleSearch);
    Object.values(dom.controls).forEach(c => c.addEventListener('input', debouncedUpdatePreview));
    ['item-font-size', 'price-font-size'].forEach(id => { const i = document.getElementById(id), v = document.getElementById(`${id}-value`); if(i && v) { v.textContent = i.value; i.addEventListener('input', e => v.textContent = e.target.value); } });
    dom.accordionHeader.addEventListener('click', function() { this.classList.toggle('active'); const c = this.nextElementSibling; if (c.style.maxHeight) { c.style.maxHeight = null; } else { c.style.maxHeight = c.scrollHeight + "px"; } });

    // --- START THE APP ---
    init();
});
