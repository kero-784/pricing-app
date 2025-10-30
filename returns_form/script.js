document.addEventListener('DOMContentLoaded', () => {
    // --- CONFIG & STATE ---
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbzsUzL3D00sB9B2B-5-MUcNNVYU9-zxPUsCI4SP_U86LTK4YfOo8_gOnxUBE4Fq4olS/exec';
    let suppliers = [], logs = [], branches = [];
    let selectedSupplier = null, currentBranch = null;

    // --- DOM ELEMENTS ---
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const branchModal = document.getElementById('branch-modal'), branchSelect = document.getElementById('branch-select'), branchConfirmBtn = document.getElementById('branch-confirm-btn'), branchDisplay = document.getElementById('branch-display');
    const createView = document.getElementById('create-view'), reportView = document.getElementById('report-view');
    const navCreate = document.getElementById('nav-create'), navReport = document.getElementById('nav-report');
    const searchSection = document.getElementById('search-section'), searchInput = document.getElementById('supplier-search'), searchResults = document.getElementById('search-results');
    const creationForm = document.getElementById('creation-form'), selectedSupplierName = document.getElementById('selected-supplier-name'), returnDetailsSection = document.getElementById('return-details-section');
    const returnValueInput = document.getElementById('return-value'), returnSerialInput = document.getElementById('return-serial');
    const cancelBtn = document.getElementById('cancel-btn');
    const logsTableBody = document.getElementById('logs-table-body'), reportSearchInput = document.getElementById('report-search'), dateFromFilter = document.getElementById('date-from-filter'), dateToFilter = document.getElementById('date-to-filter');
    const reportBranchNameSpans = document.querySelectorAll('.report-branch-name');

    // --- API & DATA FUNCTIONS ---
    const showLoader = (text) => { document.getElementById('loader-text').textContent = text; loader.classList.remove('hidden'); };
    const hideLoader = () => loader.classList.add('hidden');

    const fetchData = async (action) => {
        try {
            const response = await fetch(`${GAS_URL}?action=${action}`);
            if (!response.ok) throw new Error(`Network response error for ${action}.`);
            const result = await response.json();
            if (!result.success) throw new Error(result.message);
            return result.data;
        } catch (error) {
            alert(`فشل تحميل البيانات: ${error.message}. يرجى إعادة تحميل الصفحة.`);
            hideLoader(); // Ensure loader is hidden on error
            return null;
        }
    };

    const saveLog = async (logData) => {
        showLoader('جاري حفظ الإقرار...');
        try {
            const response = await fetch(GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(logData) });
            const result = await response.json();
            if (!result.success) throw new Error(result.message);
            return true;
        } catch (error) { alert(`فشل حفظ الإقرار: ${error.message}`); return false;
        } finally { hideLoader(); }
    };

    // --- RENDER & UI ---
    const renderLogs = () => {
        logsTableBody.innerHTML = '';
        const filteredLogs = filterLogs();
        if (filteredLogs.length === 0) { logsTableBody.innerHTML = '<tr><td colspan="5">لا توجد سجلات تطابق البحث لهذا الفرع</td></tr>'; return; }
        filteredLogs.forEach((log) => {
            const date = new Date(log.Timestamp).toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' });
            const originalLogIndex = logs.findIndex(ol => ol.Timestamp === log.Timestamp);
            const returnTypeText = log.ReturnType === 'HAS_RETURNS' ? 'مرتجع متوفر' : 'لا يوجد مرتجع';
            const row = `<tr><td>${date}</td><td>${log.SupplierName}</td><td>${log.RepresentativeName}</td><td>${returnTypeText}</td><td><button class="btn-reprint" data-log-index="${originalLogIndex}">إعادة طباعة</button></td></tr>`;
            logsTableBody.innerHTML += row;
        });
        document.querySelectorAll('.btn-reprint').forEach(button => button.addEventListener('click', onReprintClick));
    };

    // --- EVENT HANDLERS ---
    const handleSearch = (e) => {
        const query = e.target.value.toLowerCase();
        if (query.length < 2) { searchResults.innerHTML = ''; return; }
        const results = suppliers.filter(s => ((s.SupplierName || '').toLowerCase().includes(query) || String(s.SupplierCode || '').includes(query)));
        searchResults.innerHTML = results.map(s => `<li data-supplier-code="${s.SupplierCode}"><strong>${s.SupplierName}</strong> (الكود: ${s.SupplierCode})</li>`).join('');
        document.querySelectorAll('#search-results li').forEach(li => li.addEventListener('click', onSupplierSelect));
    };

    const onSupplierSelect = (e) => {
        const supplierCode = e.currentTarget.dataset.supplierCode;
        selectedSupplier = suppliers.find(s => s.SupplierCode == supplierCode);
        selectedSupplierName.textContent = selectedSupplier.SupplierName;
        searchSection.classList.add('hidden');
        creationForm.classList.remove('hidden');
        creationForm.reset();
        handleReturnTypeChange();
    };

    const handleCancel = () => {
        creationForm.classList.add('hidden');
        searchSection.classList.remove('hidden');
        searchInput.value = '';
        searchResults.innerHTML = '';
    };

    const handleReturnTypeChange = () => {
        const returnType = document.querySelector('input[name="returnType"]:checked').value;
        if (returnType === 'HAS_RETURNS') {
            returnDetailsSection.classList.remove('hidden');
            returnValueInput.required = true;
            returnSerialInput.required = true;
        } else {
            returnDetailsSection.classList.add('hidden');
            returnValueInput.required = false;
            returnSerialInput.required = false;
        }
    };
    
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        const returnType = document.querySelector('input[name="returnType"]:checked').value;
        const logData = {
            Timestamp: new Date().toISOString(), BranchCode: currentBranch.BranchCode,
            SupplierCode: selectedSupplier.SupplierCode, SupplierName: selectedSupplier.SupplierName,
            SupplierCR: selectedSupplier.cr, SupplierTaxID: selectedSupplier.taxid,
            RepresentativeName: document.getElementById('rep-name').value.trim(),
            RepresentativeID: document.getElementById('rep-id').value.trim(),
            ReturnType: returnType,
            ReturnValue: returnType === 'HAS_RETURNS' ? returnValueInput.value : '',
            ReturnSerial: returnType === 'HAS_RETURNS' ? returnSerialInput.value : ''
        };
        const success = await saveLog(logData);
        if (success) {
            populateAndPrintForm(logData);
            handleCancel();
            if (reportView.classList.contains('active-view')) { logs = await fetchData('getLogs') || []; renderLogs(); } else { logs = []; }
        }
    };
    
    const onReprintClick = (e) => {
        const logData = logs[e.currentTarget.dataset.logIndex];
        const supplierDetails = suppliers.find(s => s.SupplierCode == logData.SupplierCode);
        const reprintData = { ...logData, SupplierCR: supplierDetails?.cr, SupplierTaxID: supplierDetails?.taxid };
        populateAndPrintForm(reprintData);
    };

    const filterLogs = () => {
        const searchTerm = reportSearchInput.value.toLowerCase();
        const dateFrom = dateFromFilter.value ? new Date(dateFromFilter.value).setHours(0,0,0,0) : null;
        const dateTo = dateToFilter.value ? new Date(dateToFilter.value).setHours(23,59,59,999) : null;
        if (!currentBranch) return []; // Guard against no branch selected
        return logs.filter(log => {
            const branchCodeMatch = String(log.BranchCode || '').trim() == String(currentBranch.BranchCode || '').trim();
            if (!branchCodeMatch) return false;
            const textMatch = (log.SupplierName || '').toLowerCase().includes(searchTerm) || (log.RepresentativeName || '').toLowerCase().includes(searchTerm);
            const dateMatch = (!dateFrom || new Date(log.Timestamp).getTime() >= dateFrom) && (!dateTo || new Date(log.Timestamp).getTime() <= dateTo);
            return textMatch && dateMatch;
        });
    };

    const toggleView = async (viewToShow) => {
        [createView, reportView].forEach(v => v.classList.remove('active-view'));
        [navCreate, navReport].forEach(n => n.classList.remove('active'));
        if (viewToShow === 'create') { createView.classList.add('active-view'); navCreate.classList.add('active'); handleCancel(); } 
        else {
            reportView.classList.add('active-view'); navReport.classList.add('active');
            showLoader('جاري تحميل السجلات...');
            logs = await fetchData('getLogs') || [];
            renderLogs();
            hideLoader();
        }
    };

    const populateAndPrintForm = (data) => {
        const formId = data.ReturnType === 'HAS_RETURNS' ? '#printable-form-has-returns' : '#printable-form-no-returns';
        const form = document.querySelector(formId);
        form.querySelectorAll('.p-date').forEach(el => el.textContent = new Date(data.Timestamp).toLocaleDateString('ar-EG'));
        form.querySelectorAll('.p-time').forEach(el => el.textContent = new Date(data.Timestamp).toLocaleTimeString('ar-EG'));
        form.querySelectorAll('.p-supplier-name').forEach(el => el.textContent = data.SupplierName);
        form.querySelectorAll('.p-supplier-code').forEach(el => el.textContent = data.SupplierCode);
        form.querySelectorAll('.p-supplier-cr').forEach(el => el.textContent = data.SupplierCR || 'غير متوفر');
        form.querySelectorAll('.p-supplier-taxid').forEach(el => el.textContent = data.SupplierTaxID || 'غير متوفر');
        form.querySelectorAll('.p-rep-name').forEach(el => el.textContent = data.RepresentativeName);
        form.querySelectorAll('.p-rep-id').forEach(el => el.textContent = data.RepresentativeID);
        form.querySelectorAll('.p-branch-name').forEach(el => el.textContent = currentBranch.BranchName);
        if (data.ReturnType === 'HAS_RETURNS') {
            form.querySelectorAll('.p-return-value').forEach(el => el.textContent = data.ReturnValue);
            form.querySelectorAll('.p-return-serial').forEach(el => el.textContent = data.ReturnSerial);
        }
        document.querySelectorAll('.printable-form').forEach(f => f.classList.remove('print-active'));
        form.classList.add('print-active');
        window.print();
    };
    
    // --- NEW & REFACTORED INITIALIZATION LOGIC ---

    const startAppWithBranch = async (branch) => {
        currentBranch = branch;
        branchDisplay.textContent = `الفرع المحدد: ${currentBranch.BranchName}`;
        reportBranchNameSpans.forEach(span => span.textContent = currentBranch.BranchName);
        
        branchModal.classList.add('hidden');
        appContainer.classList.remove('hidden');

        showLoader('جاري تحميل بيانات الموردين...');
        suppliers = await fetchData('getSuppliers');
        hideLoader();
    };

    const showManualBranchSelector = () => {
        branchSelect.innerHTML = '<option value="" disabled selected>اختر فرعك</option>' + branches.map(b => `<option value="${b.BranchCode}" data-branch-name="${b.BranchName}">${b.BranchName}</option>`).join('');
        branchModal.classList.remove('hidden');
    };

    const initializeBranchLogic = async () => {
        showLoader('جاري تحميل بيانات الفروع...');
        branches = await fetchData('getBranches') || [];
        hideLoader();

        if (branches.length === 0) {
            alert("فشل تحميل قائمة الفروع. لا يمكن متابعة التطبيق.");
            return;
        }

        const userBranchCode = currentUserData?.permissions?.AssignedBranchCode;
        console.log("User's assigned branch code:", userBranchCode);

        if (userBranchCode) {
            const assignedBranch = branches.find(b => 
                String(b.BranchCode).trim() === String(userBranchCode).trim()
            );

            if (assignedBranch) {
                console.log("Found matching branch, starting app automatically:", assignedBranch.BranchName);
                await startAppWithBranch(assignedBranch);
            } else {
                console.warn(`Assigned branch code '${userBranchCode}' not found. Falling back to manual selection.`);
                showManualBranchSelector();
            }
        } else {
            console.log("No assigned branch code for user. Showing manual selector.");
            showManualBranchSelector();
        }
    };
    
    // MODIFIED: This handler now uses the new functions
    const handleManualBranchConfirm = () => {
        const selectedOption = branchSelect.options[branchSelect.selectedIndex];
        if (!selectedOption.value) { alert('الرجاء اختيار فرع.'); return; }
        const selectedBranch = { BranchCode: selectedOption.value, BranchName: selectedOption.dataset.branchName };
        startAppWithBranch(selectedBranch);
    };

    const init = () => {
        if (!currentUserData) {
            console.error("Authentication failed or is pending, halting app initialization.");
            return;
        }
        
        initializeBranchLogic(); // This is the new starting point

        // Attach all other event listeners
        branchConfirmBtn.addEventListener('click', handleManualBranchConfirm);
        navCreate.addEventListener('click', () => toggleView('create'));
        navReport.addEventListener('click', () => toggleView('report'));
        searchInput.addEventListener('input', handleSearch);
        creationForm.addEventListener('submit', handleFormSubmit);
        document.querySelectorAll('input[name="returnType"]').forEach(radio => radio.addEventListener('change', handleReturnTypeChange));
        cancelBtn.addEventListener('click', handleCancel);
        [reportSearchInput, dateFromFilter, dateToFilter].forEach(el => el.addEventListener('input', renderLogs));
    };

    init();
});
